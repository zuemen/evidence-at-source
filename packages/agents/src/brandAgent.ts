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
import { computeEvidenceIntegrityIndex, type IntegrityGrade } from './evidenceIntegrity.js';

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

/**
 * Per-worker omission verdicts for a cohort and period: true = the worker holds
 * a genuine record the factory left out of its published commitment. A bare list
 * of flags with no identifiers — the agent can count omissions but cannot name
 * whose record went missing.
 */
export interface OmissionCohort {
  readonly cohort: string;
  readonly window: string;
  readonly signals: readonly boolean[];
}

export type OmissionCountAnswer =
  | { readonly ok: true; readonly cohort: string; readonly window: string; readonly count: number }
  | { readonly ok: false; readonly reason: ReasonCode };

export type CommitmentCoverageAnswer =
  | { readonly ok: true; readonly cohort: string; readonly window: string; readonly coverage: number }
  | { readonly ok: false; readonly reason: ReasonCode };

export type EvidenceIntegrityAnswer =
  | {
      readonly ok: true;
      readonly cohort: string;
      readonly window: string;
      readonly index: number;
      readonly grade: IntegrityGrade;
      readonly components: { readonly coverage?: number; readonly consistency?: number };
    }
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
  getOmissionSignalCount(cohort: string, window: string): OmissionCountAnswer;
  getCommitmentCoverage(cohort: string, window: string): CommitmentCoverageAnswer;
  getEvidenceIntegrityIndex(cohort: string, window: string): EvidenceIntegrityAnswer;
}

/** Discrepancy = a verdict that is neither consistent nor unassessable. */
function isDiscrepancy(code: ReconciliationCode): boolean {
  return code === 'DISCREPANCY_UNDERPAID' || code === 'DISCREPANCY_OVERPAID';
}

export function createBrandAgent(
  evidence: readonly CohortEvidence[],
  reconciliations: readonly ReconciliationCohort[] = [],
  omissions: readonly OmissionCohort[] = [],
): BrandAgent {
  function findOmissionCohort(cohort: string, window: string): OmissionCohort | undefined {
    return omissions.find((o) => o.cohort === cohort && o.window === window);
  }

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

    getOmissionSignalCount(cohort, window) {
      const record = findOmissionCohort(cohort, window);
      if (!record) {
        return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
      }

      // Only the count travels back — never which positions were omitted.
      return { ok: true, cohort, window, count: record.signals.filter(Boolean).length };
    },

    getCommitmentCoverage(cohort, window) {
      const record = findOmissionCohort(cohort, window);
      if (!record || record.signals.length === 0) {
        return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
      }

      const covered = record.signals.filter((omitted) => !omitted).length;

      return { ok: true, cohort, window, coverage: covered / record.signals.length };
    },

    getEvidenceIntegrityIndex(cohort, window) {
      const omission = findOmissionCohort(cohort, window);
      const reconciliation = reconciliations.find(
        (r) => r.cohort === cohort && r.window === window,
      );

      const components: { coverage?: number; consistency?: number } = {};
      if (omission && omission.signals.length > 0) {
        const covered = omission.signals.filter((omitted) => !omitted).length;
        components.coverage = covered / omission.signals.length;
      }
      if (reconciliation && reconciliation.outcomes.length > 0) {
        const discrepancies = reconciliation.outcomes.filter(isDiscrepancy).length;
        components.consistency = 1 - discrepancies / reconciliation.outcomes.length;
      }

      const { index, grade } = computeEvidenceIntegrityIndex(components);
      if (index === null || grade === null) {
        return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
      }

      return { ok: true, cohort, window, index, grade, components };
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
