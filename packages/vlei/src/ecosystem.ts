/**
 * Bootstraps a complete synthetic vLEI ecosystem for tests and the demo:
 * a GLEIF root AID that qualifies one QVI, which then issues Legal Entity
 * credentials; each legal entity can grant engagement-context roles to its
 * AI agents. All LEIs are synthetic (visibly fake, valid check digits).
 */

import { KelStore, createAid, type AidController } from './kel.js';
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
  /** QVI-side revocation of this legal entity's credential. */
  revokeCredential(): void;
}

export interface CreateLegalEntityInput {
  readonly legalName: string;
  readonly didWeb: string;
  readonly leiTag: string;
  readonly signingJwk: Record<string, unknown>;
}

export interface Ecosystem {
  readonly gleifAid: string;
  readonly trust: VleiTrustContext;
  createLegalEntity(input: CreateLegalEntityInput): LegalEntityHandle;
  revokeQviCredential(): void;
}

export function bootstrapEcosystem(): Ecosystem {
  const kels = new KelStore();
  const tels = new TelStore(kels);

  const gleif: AidController = createAid();
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
        },
        edges: { qvi: { n: qviCredential.acdc.d, s: qviCredential.acdc.s } },
      });

      const ecrByAgent = new Map<string, SignedAcdc>();

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
