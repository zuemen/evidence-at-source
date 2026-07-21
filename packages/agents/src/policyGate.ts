/**
 * Policy Gate layer 2 — the query layer.
 *
 * Layer 1 (credential layer) answers "is this evidence real?". This layer
 * answers a different question: "is this something anyone is allowed to ask?".
 *
 * The `individual` query kind exists so that it can be *rejected*. A brand's
 * system can phrase such a request; the gate is what makes sure it never gets
 * an answer. Note that nothing here can return worker-level records — there is
 * no code path that produces one, which is the point.
 */

import type { ReasonCode } from '@eas/shared';

/**
 * Minimum cohort size before an aggregate may be answered. Below this, a
 * "compliance rate" over a handful of workers can be reversed into a statement
 * about a named person, which is exactly the retaliation risk this system
 * exists to remove.
 */
export const K_ANONYMITY_THRESHOLD = 5;

export type AggregateMetric =
  | 'workingHoursComplianceRate'
  | 'recruitmentFeeComplianceRate'
  | 'documentCustodyComplianceRate'
  | 'contractConsentComplianceRate';

export type Query =
  | {
      readonly kind: 'aggregate';
      readonly metric: AggregateMetric;
      readonly cohort: string;
    }
  | {
      readonly kind: 'individual';
      readonly workerDID: string;
    };

export interface CohortContext {
  readonly cohortSize: number;
}

export type QueryDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ReasonCode };

export function checkQueryLayer(query: Query, context: CohortContext): QueryDecision {
  if (query.kind === 'individual') {
    return { ok: false, reason: 'INDIVIDUAL_QUERY_REJECTED' };
  }

  if (context.cohortSize < K_ANONYMITY_THRESHOLD) {
    return { ok: false, reason: 'AGGREGATE_BELOW_K_ANONYMITY' };
  }

  return { ok: true };
}
