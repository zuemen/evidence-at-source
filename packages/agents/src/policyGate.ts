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

import {
  K_ANONYMITY,
  disclosureFor,
  type Disclosure,
  type KAnonymityThresholds,
  type ReasonCode,
} from '@eas/shared';

export type { Disclosure, KAnonymityThresholds };

export type AggregateMetric =
  | 'workingHoursComplianceRate'
  | 'recruitmentFeeComplianceRate'
  | 'documentCustodyComplianceRate'
  | 'contractConsentComplianceRate'
  | 'payrollDiscrepancyRate'
  // Integrity metrics. They are aggregates like any other and must clear the
  // same bar: a coverage figure over two workers says as much about a named
  // person as a compliance rate over two workers does.
  | 'commitmentCoverageRate'
  | 'omissionSignalCount'
  | 'evidenceIntegrityIndex'
  // Self-report divergence. Same bar again: a divergence rate over three
  // workers in a factory of three is a statement about those three people.
  | 'selfReportDivergenceRate'
  | 'unmatchedSelfReportCount';

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
  /**
   * What the caller intends to publish. A rate needs a bigger cohort than a
   * universal proposition, because a rate carries how many differ and a
   * universal proposition only carries whether any do.
   *
   * Defaults to `rate`, the stricter of the two: a caller that has not thought
   * about this should get the safer answer, not the looser one.
   */
  readonly disclosure?: Disclosure;
  readonly thresholds?: KAnonymityThresholds;
}

export type QueryDecision =
  | {
      readonly ok: true;
      /** What this cohort actually supports, which may be less than requested. */
      readonly disclosure: Disclosure;
      /** Reported back so an auditor knows which bar the answer cleared. */
      readonly thresholds: KAnonymityThresholds;
    }
  | { readonly ok: false; readonly reason: ReasonCode };

export function checkQueryLayer(query: Query, context: CohortContext): QueryDecision {
  if (query.kind === 'individual') {
    return { ok: false, reason: 'INDIVIDUAL_QUERY_REJECTED' };
  }

  const thresholds = context.thresholds ?? K_ANONYMITY;
  const supported = disclosureFor(context.cohortSize, thresholds);

  // Below the floor nothing is said, and the code says so distinctly: a caller
  // that could tell "too small for a rate" from "too small for anything" would
  // learn where the cohort sits relative to the bar.
  if (supported === null) {
    return { ok: false, reason: 'COHORT_TOO_SMALL' };
  }

  const requested = context.disclosure ?? 'rate';
  if (requested === 'rate' && supported !== 'rate') {
    return { ok: false, reason: 'AGGREGATE_BELOW_K_ANONYMITY' };
  }

  return { ok: true, disclosure: requested, thresholds };
}
