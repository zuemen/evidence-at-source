/**
 * Bootstraps a complete synthetic vLEI ecosystem for tests and the demo:
 * a GLEIF root AID that qualifies one QVI, which then issues Legal Entity
 * credentials; each legal entity can grant engagement-context roles to its
 * AI agents. All LEIs are synthetic (visibly fake, valid check digits).
 */

import { KelStore, createAid, type AidController, type KeyState } from './kel.js';
import { CredentialRegistry, TelStore } from './tel.js';
import { syntheticLei } from './lei.js';
import { issueAcdc, type SignedAcdc } from './acdc.js';
import { AI_AGENT_ROLE, type VleiPresentation, type VleiTrustContext } from './chain.js';

export interface LegalEntityHandle {
  readonly aid: string;
  readonly lei: string;
  readonly legalName: string;
  readonly didWeb: string;
  readonly credential: SignedAcdc;
  presentation(): VleiPresentation;
  grantEcr(agentDid: string, role?: string): VleiPresentation;
  revokeEcr(agentDid: string): void;
  /** The person holding an office here — the human who signs off (題06 Q4). */
  grantOor(personDid: string, personLegalName: string, officialRole: string): VleiPresentation;
  revokeOor(personDid: string): void;
  /** QVI-side revocation of this legal entity's credential. */
  revokeCredential(): void;
}

export interface CreateLegalEntityInput {
  readonly legalName: string;
  readonly didWeb: string;
  readonly leiTag: string;
  readonly signingJwk: Record<string, unknown>;
  /**
   * The vetting this QVI performed on the entity. Written by the QVI, never by
   * the entity: an issuer that could set its own tier could claim to be a
   * regulator, and the whole tier ladder would rest on its honesty.
   */
  readonly issuerTier?: string;
}

export interface Ecosystem {
  readonly gleifAid: string;
  /** Snapshot of the GLEIF root key state (multisig threshold demo surface). */
  readonly gleifKeyState: KeyState;
  readonly trust: VleiTrustContext;
  createLegalEntity(input: CreateLegalEntityInput): LegalEntityHandle;
  revokeQviCredential(): void;
}

export function bootstrapEcosystem(): Ecosystem {
  const kels = new KelStore();
  const tels = new TelStore(kels);

  // GLEIF's real root is council-held multisig; the PoC mirrors that shape.
  const gleif: AidController = createAid({ keyCount: 3, threshold: 2 });
  kels.register(gleif.kel);
  const gleifRegistry = new CredentialRegistry(gleif);
  tels.register(gleifRegistry);

  const qvi: AidController = createAid();
  kels.register(qvi.kel);
  const qviRegistry = new CredentialRegistry(qvi);
  tels.register(qviRegistry);

  const qviCredential = issueAcdc({
    issuer: gleif,
    registry: gleifRegistry,
    schema: 'qvi',
    subject: qvi.aid,
    claims: { LEI: syntheticLei('QVIEXAMPLE') },
  });

  const trust: VleiTrustContext = { trustedRoots: new Set([gleif.aid]), kels, tels };

  return {
    gleifAid: gleif.aid,
    gleifKeyState: gleif.currentKeyState(),
    trust,

    createLegalEntity(input) {
      const entity = createAid();
      kels.register(entity.kel);
      const entityRegistry = new CredentialRegistry(entity);
      tels.register(entityRegistry);

      const lei = syntheticLei(input.leiTag);
      const credential = issueAcdc({
        issuer: qvi,
        registry: qviRegistry,
        schema: 'legalEntity',
        subject: entity.aid,
        claims: {
          LEI: lei,
          legalName: input.legalName,
          didWeb: input.didWeb,
          credentialSigningJwk: input.signingJwk,
          ...(input.issuerTier === undefined ? {} : { issuerTier: input.issuerTier }),
        },
        edges: { qvi: { n: qviCredential.acdc.d, s: qviCredential.acdc.s } },
      });

      const ecrByAgent = new Map<string, SignedAcdc>();
      const oorByPerson = new Map<string, SignedAcdc>();

      const baseBundle = (): Record<string, SignedAcdc> => ({
        [credential.acdc.d]: credential,
        [qviCredential.acdc.d]: qviCredential,
      });

      return {
        aid: entity.aid,
        lei,
        legalName: input.legalName,
        didWeb: input.didWeb,
        credential,

        presentation() {
          return { focus: credential.acdc.d, credentials: baseBundle() };
        },

        grantEcr(agentDid, role = AI_AGENT_ROLE) {
          const ecr = issueAcdc({
            issuer: entity,
            registry: entityRegistry,
            schema: 'ecr',
            subject: agentDid,
            claims: { LEI: lei, agentDid, engagementContextRole: role },
            edges: { le: { n: credential.acdc.d, s: credential.acdc.s } },
          });
          ecrByAgent.set(agentDid, ecr);

          return {
            focus: ecr.acdc.d,
            credentials: { ...baseBundle(), [ecr.acdc.d]: ecr },
          };
        },

        grantOor(personDid, personLegalName, officialRole) {
          const oor = issueAcdc({
            issuer: entity,
            registry: entityRegistry,
            schema: 'oor',
            subject: personDid,
            claims: { LEI: lei, personLegalName, officialRole },
            edges: { le: { n: credential.acdc.d, s: credential.acdc.s } },
          });
          oorByPerson.set(personDid, oor);

          return {
            focus: oor.acdc.d,
            credentials: { ...baseBundle(), [oor.acdc.d]: oor },
          };
        },

        revokeOor(personDid) {
          const oor = oorByPerson.get(personDid);
          if (oor === undefined) throw new Error('no OOR was granted to that person');
          entityRegistry.revoke(oor.acdc.d);
        },

        revokeEcr(agentDid) {
          const ecr = ecrByAgent.get(agentDid);
          if (ecr === undefined) throw new Error('no ECR was granted to that agent');
          entityRegistry.revoke(ecr.acdc.d);
        },

        revokeCredential() {
          qviRegistry.revoke(credential.acdc.d);
        },
      };
    },

    revokeQviCredential() {
      gleifRegistry.revoke(qviCredential.acdc.d);
    },
  };
}
