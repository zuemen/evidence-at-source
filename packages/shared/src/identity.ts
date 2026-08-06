/**
 * Who the wallet belongs to, and whether a person was present when it signed.
 *
 * The dual signature answers "did the holder of this key consent?". It does
 * not answer "is the holder of this key the worker?" — and those come apart
 * exactly where this project's second attacker lives. An employer forging a
 * record is defeated by the counter-signature. A broker who has taken the
 * worker's documents and their phone is not: the broker holds the key, so
 * every signature is genuine and every pairing checks out.
 *
 * Two mechanisms close that gap, and neither of them is fraud detection:
 *
 *   - **一人一憑證**. A residency credential from the immigration authority
 *     carries an identity anchor. The registry refuses to bind a second live
 *     wallet to an anchor that already has one, so a broker cannot quietly
 *     enrol a parallel wallet for the same person. Legitimate re-binding
 *     after a lost device must revoke first, which means it leaves a trace.
 *
 *   - **不可轉讓**. Every counter-signature carries an assertion from the
 *     device's own authenticator, shaped like a FIDO/WebAuthn assertion. The
 *     signature is worthless unless the authenticator says it verified a
 *     user — a fingerprint, a face, a PIN.
 *
 * What this still cannot do is detect coercion. A knife at someone's throat
 * does not stop a fingerprint from working. Saying otherwise would be the
 * most dangerous claim in this repository.
 */

import { jwtVerify, importJWK, type JWK } from 'jose';
import type { PublicJwk } from './sdjwt.js';
import type { ReasonCode } from './reasonCodes.js';

/**
 * A device authenticator's statement that it just verified its user.
 *
 * Deliberately shaped like a WebAuthn assertion: in production `signature` is
 * produced inside the device's secure element by a key that cannot be
 * exported, which is what makes the wallet non-transferable in the only sense
 * that matters — copying the credential file does not copy the finger.
 */
export interface DeviceAssertion {
  readonly credentialId: string;
  /** One-time value from the verifier. Without it an assertion is replayable. */
  readonly challenge: string;
  /** The authenticator's user-verification flag. False is always a rejection. */
  readonly userVerified: boolean;
  readonly signature: string;
}

export type AssertionVerifier = (assertion: DeviceAssertion) => boolean | Promise<boolean>;

/**
 * The default, and it refuses everything.
 *
 * A verifier with no way to check an authenticator has not established
 * presence — it has established nothing, and nothing must never look like
 * success. Callers pass a real verifier explicitly or get refusals.
 */
export const stubAssertionVerifier: AssertionVerifier = () => false;

/** The facts an enrolment reads out of a verified ResidencyCredential. */
export interface ResidencyFacts {
  readonly identityAnchor: string;
  readonly holderDid: string;
  readonly deviceCredentialId: string;
  /** ISO 8601 date. Past it, the binding is stale rather than merely absent. */
  readonly permitValidUntil: string;
}

export type EnrollmentStatus = 'ACTIVE' | 'NOT_ENROLLED' | 'SUPERSEDED' | 'PERMIT_EXPIRED';

export type EnrollmentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ReasonCode };

export interface EnrollmentRegistry {
  /** Binds a wallet to an identity anchor. One live wallet per anchor. */
  enroll(facts: ResidencyFacts): EnrollmentResult;
  /** Ends a binding — a lost device, or a departure. Frees the anchor. */
  revoke(holderDid: string): void;
  statusOf(holderDid: string, at: Date): EnrollmentStatus;
  deviceCredentialIdFor(holderDid: string): string | undefined;
  /** How many wallets this anchor has ever had. A second one is a story. */
  bindingCountFor(identityAnchor: string): number;
}

interface Binding {
  readonly facts: ResidencyFacts;
  live: boolean;
}

export function createEnrollmentRegistry(): EnrollmentRegistry {
  const byDid = new Map<string, Binding>();
  const historyByAnchor = new Map<string, number>();

  function liveBindingForAnchor(anchor: string): Binding | undefined {
    for (const binding of byDid.values()) {
      if (binding.live && binding.facts.identityAnchor === anchor) return binding;
    }

    return undefined;
  }

  return {
    enroll(facts) {
      const existing = liveBindingForAnchor(facts.identityAnchor);

      // Re-enrolling the same wallet is idempotent; a *different* wallet for a
      // live anchor is the broker case, and it is refused rather than merged.
      if (existing !== undefined && existing.facts.holderDid !== facts.holderDid) {
        return { ok: false, reason: 'IDENTITY_ALREADY_ENROLLED' };
      }

      byDid.set(facts.holderDid, { facts, live: true });
      historyByAnchor.set(
        facts.identityAnchor,
        existing?.facts.holderDid === facts.holderDid
          ? (historyByAnchor.get(facts.identityAnchor) ?? 1)
          : (historyByAnchor.get(facts.identityAnchor) ?? 0) + 1,
      );

      return { ok: true };
    },

    revoke(holderDid) {
      const binding = byDid.get(holderDid);
      if (binding !== undefined) binding.live = false;
    },

    statusOf(holderDid, at) {
      const binding = byDid.get(holderDid);
      if (binding === undefined) return 'NOT_ENROLLED';
      if (!binding.live) return 'SUPERSEDED';

      // Date-only comparison: a permit is valid through the whole of its final
      // day, so the boundary is the start of the following one.
      return new Date(`${binding.facts.permitValidUntil}T23:59:59Z`) < at
        ? 'PERMIT_EXPIRED'
        : 'ACTIVE';
    },

    deviceCredentialIdFor(holderDid) {
      const binding = byDid.get(holderDid);

      return binding !== undefined && binding.live ? binding.facts.deviceCredentialId : undefined;
    },

    bindingCountFor(identityAnchor) {
      return historyByAnchor.get(identityAnchor) ?? 0;
    },
  };
}

export type PresenceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ReasonCode };

/**
 * Reads the assertion out of a counter-signature and checks that a person was
 * there. The attestation is re-verified rather than trusted from a caller: an
 * assertion lifted out of one attestation and pasted into another would
 * otherwise pass.
 */
export async function verifyDevicePresence(
  attestation: string,
  workerPublicKey: PublicJwk,
  expectedCredentialId: string,
  verify: AssertionVerifier,
): Promise<PresenceResult> {
  let assertion: DeviceAssertion | undefined;

  try {
    const key = await importJWK(workerPublicKey as JWK, 'ES256');
    const { payload } = await jwtVerify(attestation, key);
    assertion = payload['deviceAssertion'] as DeviceAssertion | undefined;
  } catch {
    return { ok: false, reason: 'MISSING_WORKER_ATTESTATION' };
  }

  if (assertion === undefined) return { ok: false, reason: 'USER_PRESENCE_NOT_VERIFIED' };
  if (assertion.credentialId !== expectedCredentialId) {
    return { ok: false, reason: 'DEVICE_CREDENTIAL_MISMATCH' };
  }
  if (assertion.userVerified !== true) {
    return { ok: false, reason: 'USER_PRESENCE_NOT_VERIFIED' };
  }
  if (!(await verify(assertion))) {
    return { ok: false, reason: 'USER_PRESENCE_NOT_VERIFIED' };
  }

  return { ok: true };
}
