/**
 * The demo world.
 *
 * One worker holds four credentials — recruitment fee, document custody,
 * contract consent and working hours — none of which counts for anything until
 * they counter-sign it. Five other workers make up the rest of the cohort so
 * that aggregate answers clear the k-anonymity floor.
 *
 * All data here is synthetic. The numbers are chosen to be recognisable in a
 * demo (186 hours, 42 overtime) and belong to nobody.
 */

import {
  createRevocationRegistry,
  createWorkerAttestation,
  generateKeyPair,
  presentCredential,
  getCredentialSchema,
  type CredentialType,
  type PrivateJwk,
  type PublicJwk,
  type ReasonCode,
  type RevocationRegistry,
} from '@eas/shared';
import { createIssuer, type Issuer } from '@eas/issuer';
import {
  buildCohortEvidence,
  checkCredentialLayer,
  createBankAgent,
  createBrandAgent,
  type BankAssessment,
  type BrandAnswer,
  type Submission,
} from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';
const COHORT = 'factory-a-2026-08';
const DEVICE = 'sha256:synthetic-device-001';

/** The single public claim each credential contributes to a verifier. */
const HEADLINE_CLAIM: Record<CredentialType, string> = {
  RecruitmentFeeCredential: 'feeWithinLegalCap',
  DocumentCustodyCredential: 'passportHeldByWorker',
  ContractConsentCredential: 'nativeLanguageVersionProvided',
  WorkingHoursCredential: 'withinRBALimit',
};

const CLAIMS: Record<CredentialType, Record<string, unknown>> = {
  RecruitmentFeeCredential: {
    workerDID: WORKER_DID,
    feeWithinLegalCap: true,
    currency: 'TWD',
    contractPeriod: '2026-08-01/2029-07-31',
    feeAmount: 48000,
    paymentSchedule: '12 monthly instalments',
    lenderName: 'Synthetic Lender Co.',
  },
  DocumentCustodyCredential: {
    workerDID: WORKER_DID,
    passportHeldByWorker: true,
    custodyConsentGiven: true,
    documentType: 'passport',
    documentHash: 'sha256:synthetic-document-hash',
    custodyLocation: 'worker residence locker',
  },
  ContractConsentCredential: {
    workerDID: WORKER_DID,
    nativeLanguageVersionProvided: true,
    language: 'id',
    consentTimestamp: '2026-07-15T09:00:00Z',
    salaryAmount: 29000,
    contractDocumentHash: 'sha256:synthetic-contract-hash',
  },
  WorkingHoursCredential: {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
  },
};

const ISSUER_OF: Record<CredentialType, 'agency' | 'factory'> = {
  RecruitmentFeeCredential: 'agency',
  DocumentCustodyCredential: 'factory',
  ContractConsentCredential: 'agency',
  WorkingHoursCredential: 'factory',
};

export interface CredentialCard {
  readonly type: CredentialType;
  readonly issuer: string;
  readonly headlineClaim: string;
  readonly attested: boolean;
  /** Conclusions any verifier sees. */
  readonly publicFields: readonly string[];
  /** Fields the schema keeps behind selective disclosure, names only. */
  readonly hiddenFields: readonly string[];
}

export interface DemoSnapshot {
  readonly workerDID: string;
  readonly credentials: readonly CredentialCard[];
  readonly cohort: string;
  readonly cohortSize: number;
  readonly subjectRevoked: boolean;
}

export interface SplitView {
  readonly bank: {
    readonly disclosed: Record<string, unknown>;
    readonly assessment: BankAssessment | null;
    readonly refusedWith: ReasonCode | null;
  };
  readonly brand: {
    readonly answer: BrandAnswer;
    readonly rejected: readonly ReasonCode[];
    readonly individualQuery: BrandAnswer;
  };
}

export interface DemoWorld {
  snapshot(): DemoSnapshot;
  attest(type: CredentialType): Promise<void>;
  attestAll(): Promise<void>;
  revokeSubject(): void;
  split(): Promise<SplitView>;
}

interface HeldCredential {
  readonly type: CredentialType;
  readonly issuer: Issuer;
  readonly issuerName: string;
  readonly credential: string;
  attestation: string | null;
}

interface CohortMember {
  readonly submission: Submission;
}

async function buildCohortMember(
  factory: Issuer,
  index: number,
  withinRBALimit: boolean,
): Promise<CohortMember> {
  const worker = await generateKeyPair();
  const workerDID = `did:key:zWorker${String(index).padStart(3, '0')}`;

  const credential = await factory.issue('WorkingHoursCredential', {
    workerDID,
    withinRBALimit,
    periodStart: '2026-08-01',
    totalHours: withinRBALimit ? 178 : 264,
    overtimeHours: withinRBALimit ? 36 : 98,
  });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID,
    credential,
    deviceFingerprint: `sha256:synthetic-device-${index}`,
  });

  return {
    submission: {
      presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
      attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: worker.publicKey,
    },
  };
}

export async function createDemoWorld(): Promise<DemoWorld> {
  const agency = await createIssuer('did:web:agency.example');
  const factory = await createIssuer('did:web:factory.example');
  const issuers = { agency, factory } as const;
  const issuerNames = {
    agency: '仲介公司 did:web:agency.example',
    factory: '工廠打卡系統 did:web:factory.example',
  } as const;

  const workerKeys: { privateKey: PrivateJwk; publicKey: PublicJwk } = await generateKeyPair();
  const revocations: RevocationRegistry = createRevocationRegistry();

  const held: HeldCredential[] = [];
  for (const type of Object.keys(CLAIMS) as CredentialType[]) {
    const which = ISSUER_OF[type];
    const issuer = issuers[which];

    held.push({
      type,
      issuer,
      issuerName: issuerNames[which],
      credential: await issuer.issue(type, CLAIMS[type]),
      attestation: null,
    });
  }

  // Five more workers, one of them over the limit, so the cohort clears k=5.
  const others: CohortMember[] = [];
  for (let i = 2; i <= 6; i += 1) {
    others.push(await buildCohortMember(factory, i, i !== 5));
  }

  async function presentationFor(entry: HeldCredential): Promise<string> {
    const schemaPublicClaims =
      entry.type === 'WorkingHoursCredential'
        ? ['withinRBALimit', 'periodStart']
        : [HEADLINE_CLAIM[entry.type]];

    return presentCredential(entry.credential, schemaPublicClaims);
  }

  return {
    snapshot() {
      return {
        workerDID: WORKER_DID,
        cohort: COHORT,
        cohortSize: others.length + 1,
        subjectRevoked: revocations.revokedSubjects.includes(WORKER_DID),
        credentials: held.map((entry) => {
          // Straight from the schema: the wallet must not invent its own idea of
          // what is hidden, or it would draw public conclusions as redacted.
          const schema = getCredentialSchema(entry.type);

          return {
            type: entry.type,
            issuer: entry.issuerName,
            headlineClaim: HEADLINE_CLAIM[entry.type],
            attested: entry.attestation !== null,
            publicFields: schema.public,
            hiddenFields: schema.hidden,
          };
        }),
      };
    },

    async attest(type) {
      const entry = held.find((candidate) => candidate.type === type);
      if (entry === undefined) return;

      entry.attestation = await createWorkerAttestation(workerKeys.privateKey, {
        workerDID: WORKER_DID,
        credential: entry.credential,
        deviceFingerprint: DEVICE,
      });
    },

    async attestAll() {
      for (const entry of held) {
        entry.attestation = await createWorkerAttestation(workerKeys.privateKey, {
          workerDID: WORKER_DID,
          credential: entry.credential,
          deviceFingerprint: DEVICE,
        });
      }
    },

    revokeSubject() {
      revocations.revokeSubject(WORKER_DID);
    },

    async split() {
      const disclosed: Record<string, unknown> = {};
      let refusedWith: ReasonCode | null = null;

      // Agent A reads the three account-opening facts.
      for (const entry of held) {
        if (entry.type === 'WorkingHoursCredential') continue;

        const decision = await checkCredentialLayer({
          presentation: await presentationFor(entry),
          attestation: entry.attestation ?? '',
          issuerPublicKey: entry.issuer.publicKey,
          workerPublicKey: workerKeys.publicKey,
          requiredClaims: [HEADLINE_CLAIM[entry.type]],
          revocations,
        });

        if (!decision.ok) {
          refusedWith = decision.reason;
          break;
        }

        disclosed[HEADLINE_CLAIM[entry.type]] = decision.payload[HEADLINE_CLAIM[entry.type]];
      }

      const assessment =
        refusedWith === null
          ? createBankAgent().assess({
              feeWithinLegalCap: disclosed['feeWithinLegalCap'] as boolean | undefined,
              passportHeldByWorker: disclosed['passportHeldByWorker'] as boolean | undefined,
              nativeLanguageVersionProvided: disclosed['nativeLanguageVersionProvided'] as
                | boolean
                | undefined,
            })
          : null;

      // Agent B aggregates the working-hours cohort, this worker included.
      const hours = held.find((entry) => entry.type === 'WorkingHoursCredential');
      const submissions: Submission[] = others.map((member) => member.submission);
      if (hours !== undefined && hours.attestation !== null) {
        submissions.unshift({
          presentation: await presentationFor(hours),
          attestation: hours.attestation,
          issuerPublicKey: hours.issuer.publicKey,
          workerPublicKey: workerKeys.publicKey,
        });
      }

      const { evidence, rejected } = await buildCohortEvidence({
        cohort: COHORT,
        metric: 'workingHoursComplianceRate',
        claim: 'withinRBALimit',
        submissions,
        revocations,
      });

      const brandAgent = createBrandAgent([evidence]);

      return {
        bank: { disclosed, assessment, refusedWith },
        brand: {
          answer: brandAgent.answer({
            kind: 'aggregate',
            metric: 'workingHoursComplianceRate',
            cohort: COHORT,
          }),
          rejected,
          individualQuery: brandAgent.answer({ kind: 'individual', workerDID: WORKER_DID }),
        },
      };
    },
  };
}
