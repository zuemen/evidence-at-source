/**
 * Query auditing against differencing attacks.
 *
 * A single aggregate that clears k-anonymity can still leak an individual when
 * combined with another. If two answered queries cover populations that differ
 * by fewer than k records, subtracting their results isolates that difference —
 * a group too small to hide anyone. This session remembers what it has answered
 * and refuses the query that would complete such a pair.
 *
 * State here is opaque record ids, never worker DIDs. The ids exist so the guard
 * can measure set differences; they are never returned to the caller.
 */

import type { ReasonCode } from '@eas/shared';

export const DEFAULT_K_ANONYMITY = 10;
export const DEFAULT_QUERY_BUDGET = 20;

export interface AuditedQuery {
  readonly cohort: string;
  readonly window: string;
  /** Opaque ids of the records this query aggregates over. No worker DIDs. */
  readonly recordIds: readonly string[];
}

export type QueryVerdict =
  | { readonly ok: true; readonly auditRef: number }
  | {
      readonly ok: false;
      readonly reason: ReasonCode;
      readonly explanation: string;
      readonly auditRef: number;
    };

export interface QuerySessionOptions {
  readonly kAnonymity?: number;
  readonly queryBudget?: number;
  /** Starting number for audit-chain references. */
  readonly auditBase?: number;
}

export interface QuerySession {
  submit(query: AuditedQuery): QueryVerdict;
}

function symmetricDifferenceSize(a: ReadonlySet<string>, b: readonly string[]): number {
  let onlyInB = 0;
  const bSet = new Set(b);
  for (const id of b) {
    if (!a.has(id)) onlyInB += 1;
  }
  let onlyInA = 0;
  for (const id of a) {
    if (!bSet.has(id)) onlyInA += 1;
  }

  return onlyInA + onlyInB;
}

export function createQuerySession(options: QuerySessionOptions = {}): QuerySession {
  const k = options.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const budget = options.queryBudget ?? DEFAULT_QUERY_BUDGET;
  const auditBase = options.auditBase ?? 1;

  const answered: Array<ReadonlySet<string>> = [];
  let submissions = 0;

  return {
    submit(query) {
      const auditRef = auditBase + submissions;
      submissions += 1;

      if (answered.length >= budget) {
        return {
          ok: false,
          reason: 'QUERY_BUDGET_EXCEEDED',
          explanation: `此 Agent 本期已用盡 ${budget} 次查詢額度`,
          auditRef,
        };
      }

      if (query.recordIds.length < k) {
        return {
          ok: false,
          reason: 'AGGREGATE_BELOW_K_ANONYMITY',
          explanation: `本次查詢母體為 ${query.recordIds.length}，低於 k-匿名門檻 ${k}`,
          auditRef,
        };
      }

      for (const prior of answered) {
        const diff = symmetricDifferenceSize(prior, query.recordIds);
        if (diff > 0 && diff < k) {
          return {
            ok: false,
            reason: 'DIFFERENCING_ATTACK_DETECTED',
            explanation:
              `本次查詢與前次查詢的母體差為 ${diff}，低於 k-匿名門檻 ${k}；` +
              `兩次結果相減可回推至特定勞工`,
            auditRef,
          };
        }
      }

      answered.push(new Set(query.recordIds));

      return { ok: true, auditRef };
    },
  };
}
