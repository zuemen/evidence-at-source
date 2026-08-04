/**
 * M2 issuer. Its only real decision is that hidden fields come from the
 * credential schema, never from the caller — an issuer cannot choose to
 * publish a worker's raw numbers even if it wants to.
 */

import {
  DEFAULT_DELEGATION_LIFETIME_SECONDS,
  DELEGATION_VCT,
  generateKeyPair,
  getCredentialSchema,
  signCredential,
  type AllowedQueryType,
  type CredentialType,
  type PublicJwk,
} from '@eas/shared';
import type { Ecosystem, LegalEntityHandle, VleiPresentation } from '@eas/vlei';

/**
 * One year. Long enough that a worker is not re-collecting evidence mid-posting,
 * short enough that a credential cannot outlive the employment it describes by
 * much. Override per issuer when a credential type warrants a different window.
 */
export const DEFAULT_CREDENTIAL_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

export interface IssuerOptions {
  readonly credentialLifetimeSeconds?: number;
}

export interface DelegationGrant {
  readonly agentDid: string;
  readonly principalName: string;
  readonly allowedQueryTypes: readonly AllowedQueryType[];
  readonly scope: readonly string[];
  readonly purpose: string;
  /** Override the 24h default, e.g. a negative value to mint an expired one. */
  readonly lifetimeSeconds?: number;
}

export interface Issuer {
  readonly did: string;
  readonly publicKey: PublicJwk;
  issue(type: CredentialType, claims: Record<string, unknown>): Promise<string>;
  /** Issues a DelegationCredential authorizing an agent to act for this institution. */
  issueDelegation(grant: DelegationGrant): Promise<string>;
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

    async issueDelegation(grant) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const lifetime = grant.lifetimeSeconds ?? DEFAULT_DELEGATION_LIFETIME_SECONDS;

      // A delegation discloses everything (the worker must see it), so it is an
      // SD-JWT with no hidden claims. Envelope fields go last so the grant cannot
      // spoof the principal or the credential type.
      const payload = {
        principalName: grant.principalName,
        agentDid: grant.agentDid,
        allowedQueryTypes: [...grant.allowedQueryTypes],
        scope: [...grant.scope],
        purpose: grant.purpose,
        principal: did,
        iss: did,
        vct: DELEGATION_VCT,
        iat: issuedAt,
        exp: issuedAt + lifetime,
      };

      return signCredential(privateKey, payload, []);
    },
  };
}

export interface VleiIssuerInput {
  readonly didWeb: string;
  readonly legalName: string;
  readonly leiTag: string;
  readonly ecosystem: Ecosystem;
  readonly options?: IssuerOptions;
}

/**
 * An issuer whose SD-JWT signing key is published inside its Legal Entity
 * vLEI credential. Verifiers must obtain the key from the verified chain —
 * a bare createIssuer key has no chain and therefore no standing.
 */
export interface VleiIssuer extends Issuer {
  readonly lei: string;
  readonly legalName: string;
  legalEntityPresentation(): VleiPresentation;
  grantAgentEcr(agentDid: string, role?: string): VleiPresentation;
  revokeAgentEcr(agentDid: string): void;
  /** QVI-side revocation of this institution's own LE credential. */
  revokeLegalEntityCredential(): void;
}

export async function createVleiIssuer(input: VleiIssuerInput): Promise<VleiIssuer> {
  const base = await createIssuer(input.didWeb, input.options ?? {});
  const entity: LegalEntityHandle = input.ecosystem.createLegalEntity({
    legalName: input.legalName,
    didWeb: input.didWeb,
    leiTag: input.leiTag,
    signingJwk: base.publicKey as unknown as Record<string, unknown>,
  });

  return {
    ...base,
    lei: entity.lei,
    legalName: input.legalName,
    legalEntityPresentation: () => entity.presentation(),
    grantAgentEcr: (agentDid, role) => entity.grantEcr(agentDid, role),
    revokeAgentEcr: (agentDid) => entity.revokeEcr(agentDid),
    revokeLegalEntityCredential: () => entity.revokeCredential(),
  };
}
