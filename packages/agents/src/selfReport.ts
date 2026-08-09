/**
 * Self-reported hours against employer filings.
 *
 * Every other detector in this repo needs the employer to have written
 * something down. Dual-signature pairing catches an altered record; cross
 * validation catches a filing that disagrees with the bank; the Merkle
 * commitment catches a record left out of a published set. A factory that
 * controls the clock system, pays exactly what it filed, and simply never
 * records the overtime defeats all three — the worker holds nothing, the
 * commitment covers nothing, and the books balance.
 *
 * A credential the worker can issue alone changes what is observable. It is
 * weak evidence: one person's word, forgeable, and deliberately ranked below
 * every institutional tier. Its value is statistical — a cohort whose
 * self-reports systematically exceed the employer's filings is a signal;
 * one worker's self-report is not. See docs/self-reported-hours.md.
 */

export type SelfReportState =
  /** Employer filed, worker did not self-report. The ordinary case. */
  | 'NORMAL'
  /** Both present and in agreement — the strongest state this system produces. */
  | 'CONFIRMED'
  /** Both present and disagreeing beyond tolerance. */
  | 'DISPUTED'
  /** The worker reported hours the employer has no record of at all. */
  | 'OMITTED'
  /** Neither side reported. Explicitly not a pass. */
  | 'NO_INFORMATION';

export interface SelfReportInput {
  /** Hours the employer filed, or null if there is no employer record. */
  readonly employerHours: number | null;
  /** Hours the worker self-reported, or null if they did not. */
  readonly selfHours: number | null;
  /** Relative difference tolerated before the pair counts as diverging. */
  readonly toleranceRatio: number;
}

export function reconcileSelfReport(input: SelfReportInput): SelfReportState {
  const { employerHours, selfHours } = input;

  if (employerHours === null && selfHours === null) return 'NO_INFORMATION';
  if (employerHours === null) return 'OMITTED';
  if (selfHours === null) return 'NORMAL';

  // Compared against the employer's figure because that is the claim under
  // scrutiny; the direction of the divergence is not the agent's business.
  const allowed = Math.abs(employerHours) * input.toleranceRatio;

  return Math.abs(selfHours - employerHours) <= allowed ? 'CONFIRMED' : 'DISPUTED';
}

/** A cohort of reconciliation states, carrying no identifiers by construction. */
export interface SelfReportCohort {
  readonly cohort: string;
  readonly window: string;
  readonly states: readonly SelfReportState[];
}

export function divergenceRate(states: readonly SelfReportState[]): number {
  if (states.length === 0) return 0;

  const diverging = states.filter((s) => s === 'DISPUTED' || s === 'OMITTED').length;

  return diverging / states.length;
}

export function unmatchedSelfReportCount(states: readonly SelfReportState[]): number {
  return states.filter((s) => s === 'OMITTED').length;
}
