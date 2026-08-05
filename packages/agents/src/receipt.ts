/**
 * Verification receipt and log — 題06 Q4 and the missing third of Q5.
 *
 * Q4 asks whether a brand challenged by an NGO can produce "which verification,
 * at what time, of which items" as due-diligence proof. An internal data
 * structure cannot be shown to a challenger, so a verifier mints a signed
 * receipt: independently verifiable by anyone holding the verifier's public key,
 * recording item *names* and a credential *hash* — never a raw value.
 *
 * Q5's third clause asks that revocation reach everyone who previously verified.
 * The log is the reverse index (credential hash -> verifiers) that makes that
 * push possible. It holds verifier DIDs and hashes only, never a worker id.
 */

import { SignJWT, jwtVerify, importJWK, type JWK } from 'jose';
import type { PrivateJwk, PublicJwk } from '@eas/shared';

export const RECEIPT_TYP = 'verification-receipt+jwt';

export type VerificationResult = 'PASS' | 'FAIL';

export interface VerificationReceipt {
  readonly verifierDid: string;
  readonly subjectCredentialHash: string;
  /** Names of the items checked. Never the values behind them. */
  readonly verifiedItems: readonly string[];
  readonly result: VerificationResult;
  readonly verifiedAt: string;
}

export async function issueVerificationReceipt(
  verifierPrivateKey: PrivateJwk,
  receipt: VerificationReceipt,
): Promise<string> {
  const key = await importJWK(verifierPrivateKey as JWK, 'ES256');

  return new SignJWT({
    subjectCredentialHash: receipt.subjectCredentialHash,
    verifiedItems: [...receipt.verifiedItems],
    result: receipt.result,
    verifiedAt: receipt.verifiedAt,
  })
    .setProtectedHeader({ alg: 'ES256', typ: RECEIPT_TYP })
    .setIssuer(receipt.verifierDid)
    .sign(key);
}

export async function verifyReceipt(
  receipt: string,
  verifierPublicKey: PublicJwk,
): Promise<VerificationReceipt | null> {
  try {
    const key = await importJWK(verifierPublicKey as JWK, 'ES256');
    const { payload } = await jwtVerify(receipt, key);
    const items = payload['verifiedItems'];

    return {
      verifierDid: String(payload['iss']),
      subjectCredentialHash: String(payload['subjectCredentialHash']),
      verifiedItems: Array.isArray(items) ? (items as string[]) : [],
      result: payload['result'] === 'FAIL' ? 'FAIL' : 'PASS',
      verifiedAt: String(payload['verifiedAt']),
    };
  } catch {
    return null;
  }
}

export interface RevocationNotice {
  readonly verifierDid: string;
  readonly subjectCredentialHash: string;
}

export interface VerificationLog {
  record(receipt: VerificationReceipt): void;
  verifiersOf(subjectCredentialHash: string): readonly string[];
  notifyRevocation(subjectCredentialHash: string): readonly RevocationNotice[];
}

export function createVerificationLog(): VerificationLog {
  const byCredential = new Map<string, Set<string>>();

  return {
    record(receipt) {
      const seen = byCredential.get(receipt.subjectCredentialHash) ?? new Set<string>();
      seen.add(receipt.verifierDid);
      byCredential.set(receipt.subjectCredentialHash, seen);
    },
    verifiersOf(hash) {
      return [...(byCredential.get(hash) ?? new Set<string>())];
    },
    notifyRevocation(hash) {
      return [...(byCredential.get(hash) ?? new Set<string>())].map((verifierDid) => ({
        verifierDid,
        subjectCredentialHash: hash,
      }));
    },
  };
}
