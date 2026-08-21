/**
 * Dual-signature pairing verification, implemented from the specification.
 *
 * This file deliberately shares no code with the reference implementation. It
 * was written from spec/dual-signature-pairing.md, so agreement between the two
 * is evidence that the specification says what it needs to say — and
 * disagreement is a defect in the specification, not merely in one of them.
 *
 * Dependencies are `jose` and `@noble/hashes`. Nothing from `@eas/*`, ever:
 * verification must not require the thing being verified.
 */

import { decodeJwt, importJWK, jwtVerify } from 'jose';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

export const ATTESTATION_TYP = 'worker-attestation+jwt';

function bytesToBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Spec section 4: hash the issuer-signed segment only.
 *
 * Everything before the first `~`. A presentation drops disclosures, so hashing
 * the whole string would break pairing for every honest selective disclosure —
 * while the `_sd` digests inside this segment still commit to every hidden
 * field, so tampering remains detectable.
 */
export function credentialHash(credentialOrPresentation) {
  const issuerSigned = String(credentialOrPresentation).split('~')[0] ?? '';

  return bytesToBase64url(sha256(utf8ToBytes(issuerSigned)));
}

/** Reads the credential's subject. Only ever used for comparison. */
function subjectOf(credential) {
  try {
    const payload = decodeJwt(String(credential).split('~')[0] ?? '');

    return typeof payload.workerDID === 'string' ? payload.workerDID : null;
  } catch {
    return null;
  }
}

/**
 * Spec section 6, steps 3 to 5.
 *
 * Steps 1, 2 and 6 (issuer signature, expiry, revocation) are the caller's,
 * because they need the issuer's key and a revocation source that a pairing
 * check has no business holding.
 */
export async function verifyPairing({ credential, attestation, workerPublicJwk }) {
  let payload;

  try {
    const key = await importJWK(workerPublicJwk, 'ES256');
    // Step 3. `typ` is part of the check: without it, any ES256 JWT the worker
    // signed carrying a subjectCredentialHash claim would be accepted.
    ({ payload } = await jwtVerify(attestation, key, { typ: ATTESTATION_TYP }));
  } catch {
    // Spec 6: absent and unverifiable are one outcome. Distinguishing them
    // would tell an attacker how close a forgery came.
    return { ok: false, reason: 'MISSING_WORKER_ATTESTATION' };
  }

  // Step 4.
  if (payload.subjectCredentialHash !== credentialHash(credential)) {
    return { ok: false, reason: 'ATTESTATION_HASH_MISMATCH' };
  }

  if (typeof payload.workerDID !== 'string') {
    return { ok: false, reason: 'MISSING_WORKER_ATTESTATION' };
  }

  // Step 5. Steps 1-4 prove only that some keyholder signed this credential.
  const subject = subjectOf(credential);
  if (subject !== null && payload.workerDID !== subject) {
    return { ok: false, reason: 'ATTESTATION_SUBJECT_MISMATCH' };
  }

  return { ok: true, workerDID: payload.workerDID };
}

/** Spec section 6, steps 1 and 2. Separate because they need the issuer key. */
export async function verifyIssuerCredential({ credential, issuerPublicJwk }) {
  const segment = String(credential).split('~')[0] ?? '';

  try {
    const key = await importJWK(issuerPublicJwk, 'ES256');
    await jwtVerify(segment, key);

    return { ok: true };
  } catch (error) {
    const expired =
      error && typeof error === 'object' && error.code === 'ERR_JWT_EXPIRED';

    return { ok: false, reason: expired ? 'CREDENTIAL_EXPIRED' : 'INVALID_ISSUER_SIGNATURE' };
  }
}
