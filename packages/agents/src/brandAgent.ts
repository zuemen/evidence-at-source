/**
 * Agent B — acts for the brand running an RBA supply-chain audit.
 *
 * The strongest guarantee here is structural, not procedural: the evidence this
 * agent holds is a list of booleans. There are no worker identifiers in it, so
 * "list the workers who reported overtime" is not a query this agent can answer
 * badly — it is a query it has no data to answer at all.
 */

import type { ReasonCode } from '@eas/shared';
import type { ReconciliationCode } from '@eas/reconciliation';
import { checkQueryLayer, type AggregateMetric, type Query } from './policyGate.js';

export interface CohortEvidence {
  readonly cohort: string;
  readonly metric: AggregateMetric;
  /** One verified conclusion per worker. Deliberately carries no identifiers. */
  readonly conclusions: readonly boolean[];
}

/**
 * Per-worker reconciliation verdicts for a cohort and pay window. Like
 * CohortEvidence, it is a bare list of codes with no identifiers — the agent
 * can report a rate but cannot name whose deposit disagreed with their hours.
 */
export interface ReconciliationCohort {
  readonly cohort: string;
  readonly window: string;
  readonly outcomes: readonly ReconciliationCode[];
}

export type PayrollRateAnswer =
  | { readonly ok: true; readonly cohort: string; readonly window: string; readonly cohortSize: number; readonly rate: number }
  | { readonly ok: false; readonly reason: ReasonCode };

export type PayrollConsistencyAnswer =
  | { readonly ok: true; readonly cohort: string; readonly window: string; readonly cohortSize: number; readonly consistent: boolean }
  | { readonly ok: false; readonly reason: ReasonCode };

export type BrandAnswer =
  | {
      readonly ok: true;
      readonly metric: AggregateMetric;
      readonly cohort: string;
      readonly cohortSize: number;
      readonly rate: number;
      readonly compliant: boolean;
    }
  | { readonly ok: false; readonly reason: ReasonCode };

export interface BrandAgent {
  answer(query: Query): BrandAnswer;
  getDiscrepancyRate(cohort: string, window: string): PayrollRateAnswer;
  checkPayrollConsistency(cohort: string, window: string): PayrollConsistencyAnswer;
}

/** Discrepancy = a verdict that is neither consistent nor unassessable. */
function isDiscrepancy(code: ReconciliationCode): boolean {
  return code === 'DISCREPANCY_UNDERPAID' || code === 'DISCREPANCY_OVERPAID';
}

export function createBrandAgent(
  evidence: readonly CohortEvidence[],
  reconciliations: readonly ReconciliationCohort[] = [],
): BrandAgent {
  function gateReconciliation(
    cohort: string,
    window: string,
  ): { ok: true; record: ReconciliationCohort } | { ok: false; reason: ReasonCode } {
    const record = reconciliations.find((r) => r.cohort === cohort && r.window === window);

    // Reuse the L2 query layer so payroll queries clear the same k-anonymity bar.
    const decision = checkQueryLayer(
      { kind: 'aggregate', metric: 'payrollDiscrepancyRate', cohort },
      { cohortSize: record?.outcomes.length ?? 0 },
    );
    if (!decision.ok) {
      return { ok: false, reason: decision.reason };
    }
    if (!record) {
      return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
    }

    return { ok: true, record };
  }

  return {
    getDiscrepancyRate(cohort, window) {
      const gated = gateReconciliation(cohort, window);
      if (!gated.ok) {
        return { ok: false, reason: gated.reason };
      }

      const outcomes = gated.record.outcomes;
      const discrepancies = outcomes.filter(isDiscrepancy).length;

      return {
        ok: true,
        cohort,
        window,
        cohortSize: outcomes.length,
        rate: discrepancies / outcomes.length,
      };
    },

    checkPayrollConsistency(cohort, window) {
      const gated = gateReconciliation(cohort, window);
      if (!gated.ok) {
        return { ok: false, reason: gated.reason };
      }

      return {
        ok: true,
        cohort,
        window,
        cohortSize: gated.record.outcomes.length,
        consistent: !gated.record.outcomes.some(isDiscrepancy),
      };
    },

    answer(query) {
      const record =
        query.kind === 'aggregate'
          ? evidence.find((e) => e.cohort === query.cohort && e.metric === query.metric)
          : undefined;

      const decision = checkQueryLayer(query, { cohortSize: record?.conclusions.length ?? 0 });
      if (!decision.ok) {
        // Only the reason code travels back — never any part of the query.
        return { ok: false, reason: decision.reason };
      }

      if (!record) {
        return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
      }

      const passing = record.conclusions.filter(Boolean).length;

      return {
        ok: true,
        metric: record.metric,
        cohort: record.cohort,
        cohortSize: record.conclusions.length,
        rate: passing / record.conclusions.length,
        compliant: passing === record.conclusions.length,
      };
    },
  };
}
