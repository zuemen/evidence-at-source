/**
 * Thin wrapper over SD-JWT VC so that every other module works with selective
 * disclosure through one vetted code path. Nothing here decides *which* fields
 * are hidden — that comes from the credential schema.
 */

import { SDJwtVcInstance, type SdJwtVcPayload } from '@sd-jwt/sd-jwt-vc';
import { ES256, digest, generateSalt } from '@sd-jwt/crypto-nodejs';

type KeyPair = Awaited<ReturnType<typeof ES256.generateKeyPair>>;

/** Disclosure frame shape, derived from the library rather than re-declared. */
type DisclosureFrameOf = NonNullable<Parameters<SDJwtVcInstance['issue']>[1]>;

/** Every credential carries these three; the rest are type-specific claims. */
export interface CredentialPayload {
  readonly iss: string;
  readonly iat: number;
  readonly vct: string;
  readonly [claim: string]: unknown;
}

export type PrivateJwk = KeyPair['privateKey'];
export type PublicJwk = KeyPair['publicKey'];

export interface VerifiedCredential {
  readonly payload: Record<string, unknown>;
}

const HASH_CONFIG = {
  hasher: digest,
  hashAlg: 'sha-256',
  saltGenerator: generateSalt,
} as const;

export async function generateKeyPair(): Promise<KeyPair> {
  return ES256.generateKeyPair();
}

/** Signs a credential, placing `hiddenFields` behind selective disclosure. */
export async function signCredential(
  privateKey: PrivateJwk,
  payload: CredentialPayload,
  hiddenFields: readonly string[],
): Promise<string> {
  const sdjwt = new SDJwtVcInstance({
    signer: await ES256.getSigner(privateKey),
    signAlg: ES256.alg,
    ...HASH_CONFIG,
  });

  const frame = { _sd: [...hiddenFields] } as DisclosureFrameOf;

  return sdjwt.issue(payload as SdJwtVcPayload, frame);
}

/** Produces a presentation disclosing only the named claims. */
export async function presentCredential(
  credential: string,
  disclose: readonly string[],
): Promise<string> {
  const sdjwt = new SDJwtVcInstance({ ...HASH_CONFIG });
  const frame = Object.fromEntries(disclose.map((field) => [field, true]));

  return sdjwt.present(credential, frame);
}

export async function verifyPresentation(
  presentation: string,
  publicKey: PublicJwk,
): Promise<VerifiedCredential> {
  const sdjwt = new SDJwtVcInstance({
    verifier: await ES256.getVerifier(publicKey),
    signAlg: ES256.alg,
    ...HASH_CONFIG,
  });

  const verified = await sdjwt.verify(presentation);

  return { payload: verified.payload as Record<string, unknown> };
}
