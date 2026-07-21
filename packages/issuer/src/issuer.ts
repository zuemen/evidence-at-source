/**
 * M2 issuer. Its only real decision is that hidden fields come from the
 * credential schema, never from the caller — an issuer cannot choose to
 * publish a worker's raw numbers even if it wants to.
 */

import {
  generateKeyPair,
  getCredentialSchema,
  signCredential,
  type CredentialType,
  type PublicJwk,
} from '@eas/shared';

/**
 * One year. Long enough that a worker is not re-collecting evidence mid-posting,
 * short enough that a credential cannot outlive the employment it describes by
 * much. Override per issuer when a credential type warrants a different window.
 */
export const DEFAULT_CREDENTIAL_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

export interface IssuerOptions {
  readonly credentialLifetimeSeconds?: number;
}

export interface Issuer {
  readonly did: string;
  readonly publicKey: PublicJwk;
  issue(type: CredentialType, claims: Record<string, unknown>): Promise<string>;
}

export async function createIssuer(did: string, options: IssuerOptions = {}): Promise<Issuer> {
  const { privateKey, publicKey } = await generateKeyPair();
  const lifetime = options.credentialLifetimeSeconds ?? DEFAULT_CREDENTIAL_LIFETIME_SECONDS;

  return {
    did,
    publicKey,
    async issue(type, claims) {
      const schema = getCredentialSchema(type);
      const issuedAt = Math.floor(Date.now() / 1000);
      // Envelope fields go last: a caller must not be able to spoof the issuer
      // identity, the credential type, or the expiry through the claims object.
      const payload = {
        ...claims,
        iss: did,
        iat: issuedAt,
        vct: type,
        exp: issuedAt + lifetime,
      };

      return signCredential(privateKey, payload, schema.hidden);
    },
  };
}
