/**
 * How small a group may be before an answer about it becomes an answer about a
 * person — the single place this project decides that.
 *
 * There used to be three numbers: 5 in the query layer, 10 in the differencing
 * guard, and 20 in the written proposal. The main query path used the loosest
 * of them, which is the worst possible outcome of having more than one.
 *
 * ## Why one threshold was never enough
 *
 * The query layer's own comment explained the danger and then failed to avoid
 * it: below the bar, "a compliance rate over a handful of workers can be
 * reversed into a statement about a named person". Five is a handful. A
 * compliance rate of 80% over five workers tells a brand that exactly one
 * person is non-compliant, and in a factory of five that is a name.
 *
 * But refusing everything below twenty throws away the useful half. "Is every
 * worker in this line compliant?" over five workers leaks nothing when the
 * answer is yes: five out of five, no individual differs from any other. So
 * the bar has two heights.
 *
 *   n >= rate      a rate may be published
 *   minimum <= n   only a universal proposition — all compliant, yes or no
 *   n < minimum    nothing is answered at all
 *
 * ## The residual risk, which is not removed
 *
 * A universal proposition answered "no" still says at least one person here is
 * non-compliant. In a small cohort a brand can respond by pressuring everyone.
 * This is the classic refusal-as-signal problem and the two-tier design only
 * reduces its resolution — from "exactly one of five" to "at least one of
 * five". Below `minimum` the system does not pretend to help, and
 * docs/k-anonymity.md says so in as many words.
 */

export interface KAnonymityThresholds {
  /** At or above this many records, a rate may be published. */
  readonly rate: number;
  /** At or above this many records, a universal proposition may be answered. */
  readonly minimum: number;
}

/**
 * Twenty and five.
 *
 * Twenty is the figure the project proposal committed to and is where a single
 * differing worker moves a rate by five points rather than twenty. Five is the
 * smallest cohort in which "all of them" is a statement about a group rather
 * than about a person or a pair.
 *
 * Both are configurable per verifier, because a factory line and a national
 * dataset are not the same problem.
 */
export const K_ANONYMITY: KAnonymityThresholds = { rate: 20, minimum: 5 };

/** What a cohort of this size may support. Null means nothing may be said. */
export type Disclosure = 'rate' | 'universal';

export function disclosureFor(
  cohortSize: number,
  thresholds: KAnonymityThresholds = K_ANONYMITY,
): Disclosure | null {
  if (cohortSize >= thresholds.rate) return 'rate';
  if (cohortSize >= thresholds.minimum) return 'universal';

  return null;
}
