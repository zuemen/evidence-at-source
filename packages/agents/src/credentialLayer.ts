/**
 * Policy Gate layer 1 — the credential layer.
 *
 * Answers "is this evidence real, and is it enough?" in one place, so that no
 * verifier has to remember the order of checks. Layer 2 only ever runs on a
 * presentation that got through here.
 */

import {
  base64urlToUtf8,
  credentialHash,
  meetsMinimumTier,
  verifyDevicePresence,
  verifyPairing,
  verifyPresentation,
  type AssertionVerifier,
  type EnrollmentRegistry,
  type IssuerTier,
  type PublicJwk,
  type ReasonCode,
  type RevocationRegistry,
} from '@eas/shared';
import { isChainVerifiedKey, type IssuerSigningKey } from './vleiBridge.js';

export interface CredentialLayerInput {
  readonly presentation: string;
  readonly attestation: string;
  /** Only obtainable from resolveIssuerSigningKey — see vleiBridge.ts. */
  readonly issuerPublicKey: IssuerSigningKey;
  readonly workerPublicKey: PublicJwk;
  /** Claims the verifier's policy needs in order to reach a conclusion. */
  readonly requiredClaims: readonly string[];
  /** Omitted means the verifier has no revocation source, not "nothing is revoked". */
  readonly revocations?: RevocationRegistry;
  /** If set, the credential's issuerTier must be at or above this (題06 Q1). */
  readonly minimumIssuerTier?: IssuerTier;
  /** If set, the credential must be bound to this facility (GS1 anti-reuse). */
  readonly expectedFacilityId?: string;
  /**
   * If set, the wallet must still be the one bound to this person's identity
   * anchor, and a user must have been verified on its device (題05 Q1/Q2).
   *
   * Optional because an RBA compliance query does not need to know which
   * wallet answered — only a query about a person does. Where it is set, the
   * verifier must supply its own assertion verifier: there is no default, so
   * a caller cannot get presence checks that silently pass.
   */
  readonly identity?: IdentityBindingCheck;
}

export interface IdentityBindingCheck {
  readonly enrollments: EnrollmentRegistry;
  /** The moment the verifier is asking about — permits expire. */
  readonly at: Date;
  readonly verifyAssertion: AssertionVerifier;
}

export type CredentialDecision =
  | { readonly ok: true; readonly payload: Record<string, unknown> }
  | { readonly ok: false; readonly reason: ReasonCode };

/**
 * Reads `exp` without verifying the signature.
 *
 * Only ever called on a presentation that has *already* failed verification, and
 * only to choose a more truthful reason code. Nothing is trusted from it: both
 * branches reject.
 */
function readUnverifiedExpiry(presentation: string): number | undefined {
  const claimsSegment = (presentation.split('~')[0] ?? '').split('.')[1];
  if (claimsSegment === undefined) return undefined;

  try {
    const decoded: unknown = JSON.parse(base64urlToUtf8(claimsSegment));
    const exp = (decoded as { exp?: unknown }).exp;

    return typeof exp === 'number' ? exp : undefined;
  } catch {
    return undefined;
  }
}

function hasExpired(exp: number | undefined): boolean {
  return exp !== undefined && exp * 1000 < Date.now();
}

export async function checkCredentialLayer(
  input: CredentialLayerInput,
): Promise<CredentialDecision> {
  // On whose authority: the key must have come through a verified Legal Entity
  // chain. Checked at runtime, not just in the types, so that a cast cannot
  // reintroduce a configuration-trusted key.
  if (!isChainVerifiedKey(input.issuerPublicKey as PublicJwk)) {
    return { ok: false, reason: 'ISSUER_VLEI_MISSING' };
  }

  let payload: Record<string, unknown>;

  try {
    const verified = await verifyPresentation(input.presentation, input.issuerPublicKey);
    payload = verified.payload;
  } catch {
    // The SD-JWT VC library rejects expired credentials during verification.
    // Saying "invalid signature" in that case would be untrue and would send a
    // reviewer looking for the wrong problem.
    if (hasExpired(readUnverifiedExpiry(input.presentation))) {
      return { ok: false, reason: 'CREDENTIAL_EXPIRED' };
    }

    return { ok: false, reason: 'INVALID_ISSUER_SIGNATURE' };
  }

  const pairing = await verifyPairing(
    input.attestation,
    input.presentation,
    input.workerPublicKey,
  );
  if (!pairing.ok) {
    return { ok: false, reason: pairing.reason };
  }

  const subject = payload['workerDID'];
  const revoked = input.revocations?.isRevoked({
    credentialHash: credentialHash(input.presentation),
    workerDID: typeof subject === 'string' ? subject : undefined,
  });
  if (revoked === true) {
    return { ok: false, reason: 'CREDENTIAL_REVOKED' };
  }

  // 題05 Q1/Q2. The pairing above proved the holder of a key consented. These
  // two prove the key still belongs to this person, and that a person was
  // present when it signed — the difference between an employer forging a
  // record and a broker holding the worker's phone.
  if (input.identity !== undefined) {
    const holder = typeof subject === 'string' ? subject : '';
    const status = input.identity.enrollments.statusOf(holder, input.identity.at);

    if (status === 'PERMIT_EXPIRED') return { ok: false, reason: 'RESIDENCY_PERMIT_EXPIRED' };
    if (status !== 'ACTIVE') return { ok: false, reason: 'WORKER_IDENTITY_UNBOUND' };

    const enrolledDevice = input.identity.enrollments.deviceCredentialIdFor(holder);
    if (enrolledDevice === undefined) return { ok: false, reason: 'WORKER_IDENTITY_UNBOUND' };

    const presence = await verifyDevicePresence(
      input.attestation,
      input.workerPublicKey,
      enrolledDevice,
      input.identity.verifyAssertion,
    );
    if (!presence.ok) return { ok: false, reason: presence.reason };
  }

  // Belt and braces: do not rely on the library continuing to enforce this.
  const expiresAt = payload['exp'];
  if (hasExpired(typeof expiresAt === 'number' ? expiresAt : undefined)) {
    return { ok: false, reason: 'CREDENTIAL_EXPIRED' };
  }

  // 題06 Q1: a factory self-declaration must not pass where the verifier's
  // policy demands third-party or authority backing.
  if (input.minimumIssuerTier !== undefined) {
    const tier = payload['issuerTier'];
    const graded =
      typeof tier === 'string' && meetsMinimumTier(tier as IssuerTier, input.minimumIssuerTier);
    if (!graded) {
      return { ok: false, reason: 'ISSUER_TIER_BELOW_THRESHOLD' };
    }
  }

  // GS1: a compliant factory's credential must not answer for another line.
  if (input.expectedFacilityId !== undefined && payload['facilityId'] !== input.expectedFacilityId) {
    return { ok: false, reason: 'CREDENTIAL_FACILITY_MISMATCH' };
  }

  for (const claim of input.requiredClaims) {
    if (!(claim in payload)) {
      return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
    }
  }

  return { ok: true, payload };
}
