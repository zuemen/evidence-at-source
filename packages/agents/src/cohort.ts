/**
 * The point where identity stops.
 *
 * Each submission arrives tied to a worker: their presentation, their
 * counter-signature, their key. Every one of those is needed to decide whether
 * the evidence is genuine — and none of them survives this function. What comes
 * out is a list of booleans, which is all any aggregate question needs and all
 * an agent is ever given.
 */

import type { IssuerTier, ReasonCode, PublicJwk, RevocationRegistry } from '@eas/shared';
import { checkCredentialLayer } from './credentialLayer.js';
import type { AuditorDirectory } from './auditorDirectory.js';
import type { IssuerSigningKey } from './vleiBridge.js';
import type { CohortEvidence } from './brandAgent.js';
import type { AggregateMetric } from './policyGate.js';

export interface Submission {
  readonly presentation: string;
  readonly attestation: string;
  readonly issuerPublicKey: IssuerSigningKey;
  readonly workerPublicKey: PublicJwk;
}

export interface CohortRequest {
  readonly cohort: string;
  readonly metric: AggregateMetric;
  /** The boolean conclusion this metric is built from, e.g. `withinRBALimit`. */
  readonly claim: string;
  readonly submissions: readonly Submission[];
  readonly revocations?: RevocationRegistry;
  /**
   * The three policy inputs below used to exist on the credential layer and be
   * passed by nobody. A check that never receives its argument is, from an
   * attacker's side of the wire, the same thing as a check that was never
   * written — and all three were reachable only from tests.
   */
  /** The minimum issuer tier the asking institution's mandate demands (題06 Q1). */
  readonly minimumIssuerTier?: IssuerTier;
  /** The facility being audited. Without it one plant answers for another (GS1). */
  readonly expectedFacilityId?: string;
  /** Resolves a credential's `verifiedBy` to a body that is really an auditor. */
  readonly auditors?: AuditorDirectory;
}

export interface CohortResult {
  readonly evidence: CohortEvidence;
  /** One code per submission that failed layer 1. Carries no worker reference. */
  readonly rejected: readonly ReasonCode[];
}

export async function buildCohortEvidence(request: CohortRequest): Promise<CohortResult> {
  const conclusions: boolean[] = [];
  const rejected: ReasonCode[] = [];

  for (const submission of request.submissions) {
    const decision = await checkCredentialLayer({
      presentation: submission.presentation,
      attestation: submission.attestation,
      issuerPublicKey: submission.issuerPublicKey,
      workerPublicKey: submission.workerPublicKey,
      requiredClaims: [request.claim],
      ...(request.revocations === undefined ? {} : { revocations: request.revocations }),
      ...(request.minimumIssuerTier === undefined
        ? {}
        : { minimumIssuerTier: request.minimumIssuerTier }),
      ...(request.expectedFacilityId === undefined
        ? {}
        : { expectedFacilityId: request.expectedFacilityId }),
      ...(request.auditors === undefined ? {} : { auditors: request.auditors }),
    });

    if (!decision.ok) {
      rejected.push(decision.reason);
      continue;
    }

    conclusions.push(decision.payload[request.claim] === true);
  }

  return {
    evidence: {
      cohort: request.cohort,
      metric: request.metric,
      conclusions,
    },
    rejected,
  };
}
