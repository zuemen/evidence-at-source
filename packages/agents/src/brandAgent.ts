/**
 * Agent B — acts for the brand running an RBA supply-chain audit.
 *
 * The strongest guarantee here is structural, not procedural: the evidence this
 * agent holds is a list of booleans. There are no worker identifiers in it, so
 * "list the workers who reported overtime" is not a query this agent can answer
 * badly — it is a query it has no data to answer at all.
 */

import { K_ANONYMITY, disclosureFor, type KAnonymityThresholds, type ReasonCode } from '@eas/shared';
import type { ReconciliationCode } from '@eas/reconciliation';
import { checkQueryLayer, type AggregateMetric, type Disclosure, type Query } from './policyGate.js';
import { createQuerySession, type QuerySession, type WindowRange } from './differencing.js';
import { computeEvidenceIntegrityIndex, type IntegrityGrade } from './evidenceIntegrity.js';
import { classifyRbaItem } from './rbaItems.js';
import {
  divergenceRate,
  unmatchedSelfReportCount,
  type SelfReportCohort,
} from './selfReport.js';

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

/**
 * 題06 Q3 — the honest half of the answer. Saying "this one needs a human on
 * the floor" is a stronger claim than a generic refusal, and an unlisted item
 * is refused rather than guessed at.
 */
export type RbaItemAnswer =
  | { readonly ok: true; readonly item: string; readonly answerable: true }
  | { readonly ok: false; readonly reason: ReasonCode };

/**
 * Every answer carries the bar it cleared, so a reader of an audit trail can
 * tell whether "83%" was published under a threshold of twenty or of five.
 */
export type BrandAnswer =
  | {
      readonly ok: true;
      readonly disclosure: 'rate';
      readonly metric: AggregateMetric;
      readonly cohort: string;
      readonly cohortSize: number;
      readonly rate: number;
      readonly compliant: boolean;
      readonly thresholds: KAnonymityThresholds;
    }
  /**
   * The middle band: the cohort is large enough to say whether anyone differs,
   * not large enough to say how many. No rate field exists on this shape, so a
   * caller cannot read one by accident.
   */
  | {
      readonly ok: true;
      readonly disclosure: 'universal';
      readonly metric: AggregateMetric;
      readonly cohort: string;
      readonly cohortSize: number;
      readonly compliant: boolean;
      readonly thresholds: KAnonymityThresholds;
    }
  | { readonly ok: false; readonly reason: ReasonCode };

export interface BrandAgent {
  answer(query: Query): BrandAnswer;
  getDiscrepancyRate(cohort: string, window: string): PayrollRateAnswer;
  checkPayrollConsistency(cohort: string, window: string): PayrollConsistencyAnswer;
  getOmissionSignalCount(cohort: string, window: string): OmissionCountAnswer;
  getCommitmentCoverage(cohort: string, window: string): CommitmentCoverageAnswer;
  getEvidenceIntegrityIndex(cohort: string, window: string): EvidenceIntegrityAnswer;
  answerRbaItem(item: string): RbaItemAnswer;
  /** Fraction of the cohort whose self-report diverges from the employer filing. */
  getSelfReportDivergenceRate(cohort: string, window: string): PayrollRateAnswer;
  /** How many workers reported hours the employer has no record of at all. */
  getUnmatchedSelfReportCount(cohort: string, window: string): OmissionCountAnswer;
}

type Refusal = { readonly ok: false; readonly reason: ReasonCode };

/**
 * The only way an aggregate leaves this agent.
 *
 * `compute` is a callback rather than a value because a value would have to be
 * computed before it could be gated, and three of this agent's methods used to
 * do exactly that — deriving a coverage figure over two workers and then
 * returning it, because nobody had remembered to add a check. Here the figure
 * cannot be derived at all until the query layer has said yes, which is the
 * same reason `runAuthorizedGate` takes a callback instead of a boolean.
 *
 * Every cohort-derived answer must come through this. `allQueriesGated.test.ts`
 * enumerates the interface and fails if a method appears that does not.
 */
function gatedAggregate<T>(
  input: {
    readonly cohort: string;
    readonly window: string;
    /**
     * The period this answer measures. Supplying it lets the differencing guard
     * tell a later *period* from a later *slice of the same period*; omitting it
     * keeps the guard strict, which is the safe default.
     */
    readonly range?: WindowRange;
    readonly metric: AggregateMetric;
    /** The population this particular answer would be derived from. */
    readonly cohortSize: number;
    /** What this answer would publish. Defaults to the stricter of the two. */
    readonly disclosure?: Disclosure;
    /** Null only when the caller has explicitly opted out. */
    readonly session: QuerySession | null;
    readonly recordIds: readonly string[];
  },
  compute: () => T | Refusal,
): T | Refusal {
  const decision = checkQueryLayer(
    { kind: 'aggregate', metric: input.metric, cohort: input.cohort },
    { cohortSize: input.cohortSize, ...(input.disclosure ? { disclosure: input.disclosure } : {}) },
  );
  if (!decision.ok) {
    // Only the reason code travels back — never a partial result.
    return { ok: false, reason: decision.reason };
  }

  // The differencing guard sees only queries that already cleared the gate,
  // because it is a record of what was *answered*. A refusal here is still a
  // refusal: compute() never runs, so nothing is derived.
  if (input.session !== null) {
    const verdict = input.session.submit({
      cohort: input.cohort,
      window: input.window,
      ...(input.range === undefined ? {} : { range: input.range }),
      recordIds: input.recordIds,
    });
    if (!verdict.ok) {
      return { ok: false, reason: verdict.reason };
    }
  }

  return compute();
}

/** Discrepancy = a verdict that is neither consistent nor unassessable. */
function isDiscrepancy(code: ReconciliationCode): boolean {
  return code === 'DISCREPANCY_UNDERPAID' || code === 'DISCREPANCY_OVERPAID';
}

export interface BrandAgentOptions {
  readonly thresholds?: KAnonymityThresholds;
  /**
   * Protection against differencing attacks — two answers that each clear
   * k-anonymity but whose populations differ by fewer than k, so subtracting
   * one from the other isolates the difference.
   *
   * This used to be an object a caller had to remember to construct and wire
   * up. The demo did; a caller of the API did not; and anyone copying this
   * file got an agent that answered both halves of the pair. So the default is
   * now a session of the agent's own, and going without one means passing
   * `differencing: false` — visible in the call site, and in code review.
   */
  readonly differencing?: QuerySession | false;
  /**
   * Per-worker self-report reconciliation states for a cohort and period.
   * Like every other cohort here it is a bare list with no identifiers, so the
   * agent can report a divergence rate but cannot name whose account differed
   * from their employer's — which matters more here than anywhere else, since
   * being identified as the worker who contradicted the factory is precisely
   * the retaliation this system exists to prevent.
   */
  readonly selfReports?: readonly SelfReportCohort[];
}

export function createBrandAgent(
  evidence: readonly CohortEvidence[],
  reconciliations: readonly ReconciliationCohort[] = [],
  omissions: readonly OmissionCohort[] = [],
  options: BrandAgentOptions = {},
): BrandAgent {
  const thresholds = options.thresholds ?? K_ANONYMITY;
  const session =
    options.differencing === false
      ? null
      : (options.differencing ?? createQuerySession({ kAnonymity: thresholds.rate }));

  /**
   * Opaque, positional ids for the records an answer covers.
   *
   * `CohortEvidence` deliberately carries no identifiers, so there is nothing
   * real to key on — and that is the property worth keeping. Positional ids
   * are enough for the attack that actually exists here: the same cohort asked
   * twice, one worker having departed in between, gives a symmetric difference
   * of one. They are keyed on the cohort and not the metric, so two different
   * metrics over the same unchanged population differ by zero and are allowed.
   *
   * A caller with real record ids should use `createQuerySession` directly and
   * pass it in; this is the floor, not the ceiling.
   */
  function positionalIds(cohort: string, size: number): string[] {
    return Array.from({ length: size }, (_, i) => `${cohort}#${i}`);
  }
  function findSelfReportCohort(cohort: string, window: string): SelfReportCohort | undefined {
    return (options.selfReports ?? []).find((r) => r.cohort === cohort && r.window === window);
  }

  function findOmissionCohort(cohort: string, window: string): OmissionCohort | undefined {
    return omissions.find((o) => o.cohort === cohort && o.window === window);
  }

  function gateReconciliation(
    cohort: string,
    window: string,
    disclosure: Disclosure,
  ): { ok: true; record: ReconciliationCohort } | { ok: false; reason: ReasonCode } {
    const record = reconciliations.find((r) => r.cohort === cohort && r.window === window);

    // Reuse the L2 query layer so payroll queries clear the same k-anonymity bar.
    const size = record?.outcomes.length ?? 0;
    const decision = checkQueryLayer(
      { kind: 'aggregate', metric: 'payrollDiscrepancyRate', cohort },
      { cohortSize: size, disclosure },
    );
    if (!decision.ok) {
      return { ok: false, reason: decision.reason };
    }

    if (session !== null) {
      const verdict = session.submit({
        cohort,
        window,
        recordIds: positionalIds(cohort, size),
      });
      if (!verdict.ok) {
        return { ok: false, reason: verdict.reason };
      }
    }
    if (!record) {
      return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
    }

    return { ok: true, record };
  }

  return {
    getDiscrepancyRate(cohort, window) {
      // A rate: needs the higher bar.
      const gated = gateReconciliation(cohort, window, 'rate');
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
      // A universal proposition — "did anyone's deposit disagree" — so the
      // middle band can answer it. This is the degraded form of the rate above.
      const gated = gateReconciliation(cohort, window, 'universal');
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

      const size = record?.signals.length ?? 0;

      return gatedAggregate(
        {
          cohort,
          window,
          metric: 'omissionSignalCount',
          cohortSize: size,
          session,
          recordIds: positionalIds(cohort, size),
        },
        () => {
          if (!record) return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };

          // Only the count travels back — never which positions were omitted.
          return { ok: true, cohort, window, count: record.signals.filter(Boolean).length };
        },
      );
    },

    getCommitmentCoverage(cohort, window) {
      const record = findOmissionCohort(cohort, window);

      const size = record?.signals.length ?? 0;

      return gatedAggregate(
        {
          cohort,
          window,
          metric: 'commitmentCoverageRate',
          cohortSize: size,
          session,
          recordIds: positionalIds(cohort, size),
        },
        () => {
          if (!record) return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };

          const covered = record.signals.filter((omitted) => !omitted).length;

          return { ok: true, cohort, window, coverage: covered / record.signals.length };
        },
      );
    },

    getEvidenceIntegrityIndex(cohort, window) {
      const omission = findOmissionCohort(cohort, window);
      const reconciliation = reconciliations.find(
        (r) => r.cohort === cohort && r.window === window,
      );

      // This answer is derived from two populations, so both must clear the bar
      // independently. Gating on the smaller one alone would let a healthy
      // reconciliation cohort carry a two-person omission cohort past the gate,
      // and the index would still be partly about those two people.
      const omissionSize = omission?.signals.length ?? 0;
      const reconciliationSize = reconciliation?.outcomes.length ?? 0;

      return gatedAggregate(
        {
          cohort,
          window,
          metric: 'evidenceIntegrityIndex',
          cohortSize: omissionSize,
          session,
          recordIds: positionalIds(cohort, omissionSize),
        },
        () =>
          gatedAggregate(
            {
              cohort,
              window,
              metric: 'evidenceIntegrityIndex',
              cohortSize: reconciliationSize,
              // The outer gate already recorded this query with the session;
              // recording it twice would make an honest index look like a pair
              // of near-identical queries and refuse itself.
              session: null,
              recordIds: [],
            },
            () => {
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
          ),
      );
    },

    getSelfReportDivergenceRate(cohort, window) {
      const record = findSelfReportCohort(cohort, window);
      const size = record?.states.length ?? 0;

      return gatedAggregate(
        {
          cohort,
          window,
          metric: 'selfReportDivergenceRate',
          cohortSize: size,
          session,
          recordIds: positionalIds(cohort, size),
        },
        () => {
          if (!record) return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };

          return {
            ok: true,
            cohort,
            window,
            cohortSize: size,
            rate: divergenceRate(record.states),
          };
        },
      );
    },

    getUnmatchedSelfReportCount(cohort, window) {
      const record = findSelfReportCohort(cohort, window);
      const size = record?.states.length ?? 0;

      return gatedAggregate(
        {
          cohort,
          window,
          metric: 'unmatchedSelfReportCount',
          cohortSize: size,
          session,
          recordIds: positionalIds(cohort, size),
        },
        () => {
          if (!record) return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };

          // A count of workers the employer has no record of — never which ones.
          return { ok: true, cohort, window, count: unmatchedSelfReportCount(record.states) };
        },
      );
    },

    answerRbaItem(item) {
      const classification = classifyRbaItem(item);
      if (classification === 'REQUIRES_ON_SITE') {
        return { ok: false, reason: 'REQUIRES_ONSITE_AUDIT' };
      }
      if (classification === 'UNKNOWN') {
        return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
      }

      return { ok: true, item, answerable: true };
    },

    answer(query) {
      const record =
        query.kind === 'aggregate'
          ? evidence.find((e) => e.cohort === query.cohort && e.metric === query.metric)
          : undefined;
      const cohortSize = record?.conclusions.length ?? 0;

      // Ask for what this cohort can actually support rather than for a rate
      // and a refusal. A cohort that has shrunk past the rate threshold — a
      // worker departing is enough — should degrade to "are they all
      // compliant" instead of going silent, because silence tells a brand
      // nothing it can act on and the universal answer still tells it
      // something true.
      const supported = disclosureFor(cohortSize, thresholds);
      const decision = checkQueryLayer(query, {
        cohortSize,
        thresholds,
        ...(supported === null ? {} : { disclosure: supported }),
      });
      if (!decision.ok) {
        // Only the reason code travels back — never any part of the query.
        return { ok: false, reason: decision.reason };
      }

      if (session !== null && query.kind === 'aggregate') {
        const verdict = session.submit({
          cohort: query.cohort,
          window: query.metric,
          recordIds: positionalIds(query.cohort, cohortSize),
        });
        if (!verdict.ok) {
          return { ok: false, reason: verdict.reason };
        }
      }

      if (!record) {
        return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
      }

      const passing = record.conclusions.filter(Boolean).length;
      const compliant = passing === record.conclusions.length;

      if (decision.disclosure === 'universal') {
        return {
          ok: true,
          disclosure: 'universal',
          metric: record.metric,
          cohort: record.cohort,
          cohortSize: record.conclusions.length,
          compliant,
          thresholds: decision.thresholds,
        };
      }

      return {
        ok: true,
        disclosure: 'rate',
        metric: record.metric,
        cohort: record.cohort,
        cohortSize: record.conclusions.length,
        rate: passing / record.conclusions.length,
        compliant,
        thresholds: decision.thresholds,
      };
    },
  };
}
