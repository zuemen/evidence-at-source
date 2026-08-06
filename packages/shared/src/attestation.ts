/**
 * Dual-signature pairing.
 *
 * The worker signs a short JWT whose `subjectCredentialHash` points at the
 * issuer's credential. Because the hash covers the whole credential, an issuer
 * that re-issues with different numbers can no longer produce a matching pair
 * without the worker's private key.
 */

import { SignJWT, jwtVerify, importJWK, type JWK } from 'jose';
import { sha256Base64url } from './hash.js';
import type { PrivateJwk, PublicJwk } from './sdjwt.js';
import type { ReasonCode } from './reasonCodes.js';
import type { DeviceAssertion } from './identity.js';

export const ATTESTATION_TYP = 'worker-attestation+jwt';

/**
 * Hashes the issuer-signed JWT segment only — everything before the first `~`.
 *
 * A presentation drops the disclosures the worker chose not to reveal, so
 * hashing the whole SD-JWT string would break the pairing for every honest
 * selective disclosure. The issuer-signed segment is stable across
 * presentations and still commits to every claim, because the `_sd` digests of
 * the hidden fields live inside it. Re-issuing with different numbers changes
 * those digests and the signature, so tampering is still caught.
 */
export function credentialHash(credentialOrPresentation: string): string {
  const issuerSignedJwt = credentialOrPresentation.split('~')[0] ?? '';

  return sha256Base64url(issuerSignedJwt);
}

export interface AttestationInput {
  readonly workerDID: string;
  readonly credential: string;
  readonly deviceFingerprint: string;
  /**
   * The worker's own reason for counter-signing, e.g. "為在台開戶查驗而反簽".
   * Optional and self-authored: it makes the worker's participation an explicit
   * act rather than an assumed one — the "下限由勞工給" side of the incentive
   * chain. It plays no part in pairing and carries no third party's claim.
   */
  readonly purpose?: string;
  /**
   * The device authenticator's proof that it verified a user just now.
   *
   * Optional here because the four work credentials are counter-signed long
   * before anyone opens a bank account, and a verifier that does not require
   * presence should not be forced to carry it. Where presence matters, the
   * gate requires it — see identity.ts.
   */
  readonly deviceAssertion?: DeviceAssertion;
}

export type PairingResult = { readonly ok: true } | { readonly ok: false; readonly reason: ReasonCode };

export async function createWorkerAttestation(
  workerPrivateKey: PrivateJwk,
  input: AttestationInput,
): Promise<string> {
  const key = await importJWK(workerPrivateKey as JWK, 'ES256');

  return new SignJWT({
    subjectCredentialHash: credentialHash(input.credential),
    workerDID: input.workerDID,
    attestedAt: new Date().toISOString(),
    deviceFingerprint: input.deviceFingerprint,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.deviceAssertion === undefined ? {} : { deviceAssertion: input.deviceAssertion }),
  })
    .setProtectedHeader({ alg: 'ES256', typ: ATTESTATION_TYP })
    .setIssuer(input.workerDID)
    .sign(key);
}

export async function verifyPairing(
  attestation: string,
  credential: string,
  workerPublicKey: PublicJwk,
): Promise<PairingResult> {
  let subjectCredentialHash: unknown;

  try {
    const key = await importJWK(workerPublicKey as JWK, 'ES256');
    const { payload } = await jwtVerify(attestation, key);
    subjectCredentialHash = payload['subjectCredentialHash'];
  } catch {
    // An unverifiable attestation is indistinguishable from having none.
    return { ok: false, reason: 'MISSING_WORKER_ATTESTATION' };
  }

  if (subjectCredentialHash !== credentialHash(credential)) {
    return { ok: false, reason: 'ATTESTATION_HASH_MISMATCH' };
  }

  return { ok: true };
}
