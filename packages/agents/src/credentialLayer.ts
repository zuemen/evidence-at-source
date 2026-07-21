/**
 * Policy Gate layer 1 — the credential layer.
 *
 * Answers "is this evidence real, and is it enough?" in one place, so that no
 * verifier has to remember the order of checks. Layer 2 only ever runs on a
 * presentation that got through here.
 */

import {
  verifyPairing,
  verifyPresentation,
  type PublicJwk,
  type ReasonCode,
} from '@eas/shared';

export interface CredentialLayerInput {
  readonly presentation: string;
  readonly attestation: string;
  readonly issuerPublicKey: PublicJwk;
  readonly workerPublicKey: PublicJwk;
  /** Claims the verifier's policy needs in order to reach a conclusion. */
  readonly requiredClaims: readonly string[];
}

export type CredentialDecision =
  | { readonly ok: true; readonly payload: Record<string, unknown> }
  | { readonly ok: false; readonly reason: ReasonCode };

export async function checkCredentialLayer(
  input: CredentialLayerInput,
): Promise<CredentialDecision> {
  let payload: Record<string, unknown>;

  try {
    const verified = await verifyPresentation(input.presentation, input.issuerPublicKey);
    payload = verified.payload;
  } catch {
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

  for (const claim of input.requiredClaims) {
    if (!(claim in payload)) {
      return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
    }
  }

  return { ok: true, payload };
}
