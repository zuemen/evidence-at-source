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

export interface Issuer {
  readonly did: string;
  readonly publicKey: PublicJwk;
  issue(type: CredentialType, claims: Record<string, unknown>): Promise<string>;
}

export async function createIssuer(did: string): Promise<Issuer> {
  const { privateKey, publicKey } = await generateKeyPair();

  return {
    did,
    publicKey,
    async issue(type, claims) {
      const schema = getCredentialSchema(type);
      // Envelope fields go last: a caller must not be able to spoof the issuer
      // identity or the credential type through the claims object.
      const payload = {
        ...claims,
        iss: did,
        iat: Math.floor(Date.now() / 1000),
        vct: type,
      };

      return signCredential(privateKey, payload, schema.hidden);
    },
  };
}
