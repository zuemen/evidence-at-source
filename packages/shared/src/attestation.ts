/**
 * Dual-signature pairing.
 *
 * The worker signs a short JWT whose `subjectCredentialHash` points at the
 * issuer's credential. Because the hash covers the whole credential, an issuer
 * that re-issues with different numbers can no longer produce a matching pair
 * without the worker's private key.
 */

import { SignJWT, jwtVerify, importJWK, type JWK } from 'jose';
import { createHash } from 'node:crypto';
import type { PrivateJwk, PublicJwk } from './sdjwt.js';
import type { ReasonCode } from './reasonCodes.js';

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

  return createHash('sha256').update(issuerSignedJwt).digest('base64url');
}

export interface AttestationInput {
  readonly workerDID: string;
  readonly credential: string;
  readonly deviceFingerprint: string;
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
