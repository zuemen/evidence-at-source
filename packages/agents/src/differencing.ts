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

import { K_ANONYMITY, type ReasonCode } from '@eas/shared';

/**
 * Subtracting two answered rates yields a rate over the difference set, so the
 * difference set has to be publishable at the same level the answers were —
 * the rate threshold, not the floor. This used to be its own number (10),
 * which meant the guard protected a bar nothing else used.
 */
export const DEFAULT_K_ANONYMITY = K_ANONYMITY.rate;
export const DEFAULT_QUERY_BUDGET = 20;

/**
 * A closed time range, as ISO dates. Supplying one lets the guard tell a second
 * *measurement* from a second *slice*: February's hours are not January's hours,
 * so subtracting the two reveals that the aggregate moved, not what anyone's
 * January value was. Without it the guard assumes overlap and stays strict.
 */
export interface WindowRange {
  readonly start: string;
  readonly end: string;
}

export interface AuditedQuery {
  readonly cohort: string;
  readonly window: string;
  /** Optional structured range. Absent means "assume it overlaps everything". */
  readonly range?: WindowRange;
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
  /**
   * The bar a *difference* between two answered queries must clear.
   *
   * Subtracting two answered rates yields a rate over the difference set, so
   * that set has to be publishable at the same level the answers were.
   */
  readonly kAnonymity?: number;
  /**
   * The floor below which a single query is refused outright.
   *
   * A different question from the one above, and therefore a different number:
   * the middle band of the two-tier design can answer a universal proposition
   * over five workers, and a session that refused it would contradict the gate
   * that had just allowed it.
   */
  readonly minimumCohort?: number;
  readonly queryBudget?: number;
  /** Starting number for audit-chain references. */
  readonly auditBase?: number;
}

export interface QuerySession {
  submit(query: AuditedQuery): QueryVerdict;
}

/**
 * Fail-closed: only a pair of ranges that can be *shown* not to touch is treated
 * as independent. A missing range on either side, or any overlap — including one
 * range containing the other, which is how `jan-oct` against `jan-sep` isolates
 * October — leaves the differencing guard in force.
 */
function provablyDisjoint(a: WindowRange | undefined, b: WindowRange | undefined): boolean {
  if (a === undefined || b === undefined) return false;

  return a.end < b.start || b.end < a.start;
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
  const floor = options.minimumCohort ?? K_ANONYMITY.minimum;
  const budget = options.queryBudget ?? DEFAULT_QUERY_BUDGET;
  const auditBase = options.auditBase ?? 1;

  const answered: Array<{ readonly range?: WindowRange; readonly ids: ReadonlySet<string> }> = [];
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

      if (query.recordIds.length < floor) {
        return {
          ok: false,
          reason: 'COHORT_TOO_SMALL',
          explanation: `本次查詢母體為 ${query.recordIds.length}，低於最低門檻 ${floor}`,
          auditRef,
        };
      }

      for (const prior of answered) {
        // Two disjoint periods are two different measurements, and the whole
        // point of this system is watching one cohort across many of them.
        if (provablyDisjoint(prior.range, query.range)) continue;

        const diff = symmetricDifferenceSize(prior.ids, query.recordIds);
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

      answered.push({
        ...(query.range === undefined ? {} : { range: query.range }),
        ids: new Set(query.recordIds),
      });

      return { ok: true, auditRef };
    },
  };
}
