/**
 * Policy Gate layer 1 — the credential layer.
 *
 * Answers "is this evidence real, and is it enough?" in one place, so that no
 * verifier has to remember the order of checks. Layer 2 only ever runs on a
 * presentation that got through here.
 */

import {
  credentialHash,
  verifyPairing,
  verifyPresentation,
  type PublicJwk,
  type ReasonCode,
  type RevocationRegistry,
} from '@eas/shared';

export interface CredentialLayerInput {
  readonly presentation: string;
  readonly attestation: string;
  readonly issuerPublicKey: PublicJwk;
  readonly workerPublicKey: PublicJwk;
  /** Claims the verifier's policy needs in order to reach a conclusion. */
  readonly requiredClaims: readonly string[];
  /** Omitted means the verifier has no revocation source, not "nothing is revoked". */
  readonly revocations?: RevocationRegistry;
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
    const decoded: unknown = JSON.parse(Buffer.from(claimsSegment, 'base64url').toString('utf8'));
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

  // Belt and braces: do not rely on the library continuing to enforce this.
  const expiresAt = payload['exp'];
  if (hasExpired(typeof expiresAt === 'number' ? expiresAt : undefined)) {
    return { ok: false, reason: 'CREDENTIAL_EXPIRED' };
  }

  for (const claim of input.requiredClaims) {
    if (!(claim in payload)) {
      return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
    }
  }

  return { ok: true, payload };
}
