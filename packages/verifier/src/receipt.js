/**
 * Verification-receipt checking.
 *
 * A receipt is a plain ES256 JWT. That is the entire point: any JWT library on
 * earth can check one, so a challenger holding a receipt never has to ask us
 * for anything — not a runtime, not a licence, not our continued existence.
 */

import { importJWK, jwtVerify } from 'jose';

export const RECEIPT_TYP = 'verification-receipt+jwt';

export async function verifyReceipt({ receipt, verifierPublicJwk }) {
  try {
    const key = await importJWK(verifierPublicJwk, 'ES256');
    const { payload, protectedHeader } = await jwtVerify(receipt, key);

    if (protectedHeader.typ !== RECEIPT_TYP) {
      return { ok: false, reason: 'RECEIPT_TYPE_MISMATCH' };
    }

    return {
      ok: true,
      verifierDid: payload.iss ?? null,
      subjectCredentialHash: payload.subjectCredentialHash ?? null,
      verifiedItems: payload.verifiedItems ?? [],
      result: payload.result ?? null,
      verifiedAt: payload.verifiedAt ?? null,
      policyVersion: payload.policyVersion ?? null,
    };
  } catch {
    return { ok: false, reason: 'RECEIPT_SIGNATURE_INVALID' };
  }
}
