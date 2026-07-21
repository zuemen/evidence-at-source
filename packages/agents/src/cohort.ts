/**
 * The point where identity stops.
 *
 * Each submission arrives tied to a worker: their presentation, their
 * counter-signature, their key. Every one of those is needed to decide whether
 * the evidence is genuine — and none of them survives this function. What comes
 * out is a list of booleans, which is all any aggregate question needs and all
 * an agent is ever given.
 */

import type { ReasonCode, PublicJwk } from '@eas/shared';
import { checkCredentialLayer } from './credentialLayer.js';
import type { CohortEvidence } from './brandAgent.js';
import type { AggregateMetric } from './policyGate.js';

export interface Submission {
  readonly presentation: string;
  readonly attestation: string;
  readonly issuerPublicKey: PublicJwk;
  readonly workerPublicKey: PublicJwk;
}

export interface CohortRequest {
  readonly cohort: string;
  readonly metric: AggregateMetric;
  /** The boolean conclusion this metric is built from, e.g. `withinRBALimit`. */
  readonly claim: string;
  readonly submissions: readonly Submission[];
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
