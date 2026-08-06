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
  poseidonCommit,
  randomSalt,
  signCredential,
  type AllowedQueryType,
  type CredentialType,
  type IssuerTier,
  type PrivateJwk,
  type PublicJwk,
} from '@eas/shared';
import type { Ecosystem, LegalEntityHandle, VleiPresentation } from '@eas/vlei';

/**
 * One year. Long enough that a worker is not re-collecting evidence mid-posting,
 * short enough that a credential cannot outlive the employment it describes by
 * much. Override per issuer when a credential type warrants a different window.
 */
export const DEFAULT_CREDENTIAL_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

const DAYS = 24 * 60 * 60;

/**
 * How long each kind of evidence stays true — 題06 Q5.
 *
 * "How long should a compliance credential be valid for?" has no single
 * answer, because the credentials describe facts with different half-lives.
 * A pay period ends; a contract does not. Giving them all one lifetime means
 * either expiring contracts too early or letting last year's overtime answer
 * this year's audit, and the second failure is the one nobody notices.
 *
 * The rule: a credential should expire when the fact it records could
 * plausibly have changed without anyone re-issuing it.
 */
export const CREDENTIAL_LIFETIME_SECONDS: Record<CredentialType, number> = {
  // Periodic facts. A new period's credential should supersede the last one,
  // so the window is one quarter — long enough for an audit cycle to reach
  // back, short enough that stale hours cannot answer a current question.
  WorkingHoursCredential: 90 * DAYS,
  SalaryDepositCredential: 90 * DAYS,
  // Custody changes whenever a passport moves. Half a year matches the rhythm
  // RBA audits actually run at, and forces a fresh declaration in between.
  DocumentCustodyCredential: 180 * DAYS,
  // One-off events whose meaning lasts as long as the contract does. A typical
  // migrant worker contract is three years.
  RecruitmentFeeCredential: 3 * 365 * DAYS,
  ContractConsentCredential: 3 * 365 * DAYS,
  // The permit's own expiry is the real limit and the gate enforces it
  // separately (RESIDENCY_PERMIT_EXPIRED), so whichever is sooner wins.
  ResidencyCredential: 365 * DAYS,
};

export interface IssuerOptions {
  readonly credentialLifetimeSeconds?: number;
  /** How much a verifier should weigh this issuer's claims. Defaults to T1. */
  readonly tier?: IssuerTier;
  /** For T2: the DID of the body whose verification backs these credentials. */
  readonly verifiedBy?: string;
  /** GS1 or equivalent facility identifier this issuer's records belong to. */
  readonly facilityId?: string;
  /**
   * Use this key pair instead of generating one.
   *
   * The point is not convenience: it lets an institution seal its audit trail
   * with the same key its Legal Entity credential publishes, so a challenger
   * checking those seals is checking a key that came off the chain rather than
   * one handed to them by the party being audited.
   */
  readonly keyPair?: { readonly privateKey: PrivateJwk; readonly publicKey: PublicJwk };
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

/**
 * Binds the credential's figures to a commitment the reconciliation circuit can
 * check against. Only the two credentials that proof consumes carry one —
 * making every credential pay for a feature two of them use would be waste.
 *
 * The salt is generated here, at issuance, and travels as a hidden claim: the
 * worker needs it to build a proof, and nobody else may see it.
 */
async function commitmentFieldsFor(
  type: string,
  claims: Record<string, unknown>,
): Promise<Record<string, string>> {
  const salt = randomSalt();

  if (type === 'WorkingHoursCredential') {
    return {
      valueCommitment: await poseidonCommit([
        BigInt(Number(claims['totalHours'])),
        BigInt(Number(claims['overtimeHours'])),
        salt,
      ]),
      commitmentSalt: salt.toString(),
    };
  }
  if (type === 'SalaryDepositCredential') {
    return {
      valueCommitment: await poseidonCommit([
        BigInt(Number(claims['depositedAmountTWD'])),
        salt,
      ]),
      commitmentSalt: salt.toString(),
    };
  }

  return {};
}

export async function createIssuer(did: string, options: IssuerOptions = {}): Promise<Issuer> {
  const { privateKey, publicKey } = options.keyPair ?? (await generateKeyPair());
  const overrideLifetime = options.credentialLifetimeSeconds;
  const tier: IssuerTier = options.tier ?? 'SELF_DECLARED';
  const { verifiedBy, facilityId } = options;

  return {
    did,
    publicKey,
    async issue(type, claims) {
      const schema = getCredentialSchema(type);
      const issuedAt = Math.floor(Date.now() / 1000);
      // An explicit override wins; otherwise the window comes from what kind
      // of fact this is, not from one number shared by every credential.
      const lifetime = overrideLifetime ?? CREDENTIAL_LIFETIME_SECONDS[type];
      // Envelope fields go last: a caller must not be able to spoof the issuer
      // identity, the credential type, or the expiry through the claims object.
      const payload = {
        ...claims,
        ...(await commitmentFieldsFor(type, claims)),
        iss: did,
        iat: issuedAt,
        vct: type,
        exp: issuedAt + lifetime,
        issuerTier: tier,
        ...(verifiedBy === undefined ? {} : { verifiedBy }),
        ...(facilityId === undefined ? {} : { facilityId }),
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
  /** The person holding an office here — the human who signs off (題06 Q4). */
  grantOfficialRole(
    personDid: string,
    personLegalName: string,
    officialRole: string,
  ): VleiPresentation;
  revokeOfficialRole(personDid: string): void;
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
    // The tier goes onto the chain, where the entity cannot rewrite it. The
    // same value also lands in each credential's payload, and layer 1 refuses
    // any payload that claims more than the chain grants.
    ...(input.options?.tier === undefined ? {} : { issuerTier: input.options.tier }),
  });

  return {
    ...base,
    lei: entity.lei,
    legalName: input.legalName,
    legalEntityPresentation: () => entity.presentation(),
    grantAgentEcr: (agentDid, role) => entity.grantEcr(agentDid, role),
    revokeAgentEcr: (agentDid) => entity.revokeEcr(agentDid),
    grantOfficialRole: (personDid, personLegalName, officialRole) =>
      entity.grantOor(personDid, personLegalName, officialRole),
    revokeOfficialRole: (personDid) => entity.revokeOor(personDid),
    revokeLegalEntityCredential: () => entity.revokeCredential(),
  };
}
