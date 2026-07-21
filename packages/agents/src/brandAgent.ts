/**
 * Agent B — acts for the brand running an RBA supply-chain audit.
 *
 * The strongest guarantee here is structural, not procedural: the evidence this
 * agent holds is a list of booleans. There are no worker identifiers in it, so
 * "list the workers who reported overtime" is not a query this agent can answer
 * badly — it is a query it has no data to answer at all.
 */

import type { ReasonCode } from '@eas/shared';
import { checkQueryLayer, type AggregateMetric, type Query } from './policyGate.js';

export interface CohortEvidence {
  readonly cohort: string;
  readonly metric: AggregateMetric;
  /** One verified conclusion per worker. Deliberately carries no identifiers. */
  readonly conclusions: readonly boolean[];
}

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
}

export function createBrandAgent(evidence: readonly CohortEvidence[]): BrandAgent {
  return {
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
