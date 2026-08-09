import { describe, expect, test } from 'vitest';
import { createBrandAgent, type SelfReportCohort } from '@eas/agents';

const WINDOW = '2026-08';

/** 24 workers: 4 disputed, 2 omitted, the rest confirmed or normal. */
const COHORT: SelfReportCohort = {
  cohort: 'factory-a',
  window: WINDOW,
  states: [
    ...Array.from({ length: 12 }, () => 'CONFIRMED' as const),
    ...Array.from({ length: 6 }, () => 'NORMAL' as const),
    ...Array.from({ length: 4 }, () => 'DISPUTED' as const),
    ...Array.from({ length: 2 }, () => 'OMITTED' as const),
  ],
};

const agent = (cohorts: readonly SelfReportCohort[] = [COHORT]) =>
  createBrandAgent([], [], [], { selfReports: cohorts });

describe('Agent B — self-report divergence (任務 1)', () => {
  test('the divergence rate counts disputed and omitted together', () => {
    const answer = agent().getSelfReportDivergenceRate('factory-a', WINDOW);

    expect(answer.ok).toBe(true);
    // 6 of 24 diverge.
    expect(answer.ok === true && answer.rate).toBeCloseTo(0.25);
  });

  test('the unmatched count reports only the workers the employer never recorded', () => {
    const answer = agent().getUnmatchedSelfReportCount('factory-a', WINDOW);

    expect(answer.ok).toBe(true);
    expect(answer.ok === true && answer.count).toBe(2);
  });

  test('both answers pass through the gate: a cohort below the floor is refused', () => {
    const tiny: SelfReportCohort = {
      cohort: 'tiny',
      window: WINDOW,
      states: ['OMITTED', 'CONFIRMED'],
    };

    const rate = agent([tiny]).getSelfReportDivergenceRate('tiny', WINDOW);
    const count = agent([tiny]).getUnmatchedSelfReportCount('tiny', WINDOW);

    expect(rate.ok).toBe(false);
    expect(count.ok).toBe(false);
  });

  test('an unknown cohort is refused rather than answered as zero', () => {
    // Zero divergence and no data are different facts; conflating them would
    // make a factory that filed nothing look perfectly consistent.
    //
    // The refusal arrives as COHORT_TOO_SMALL rather than CLAIM_NOT_DISCLOSED,
    // because an unknown cohort has size zero and the floor check runs first.
    // That is the better answer: a caller cannot tell "no such cohort" from
    // "cohort below the floor", so probing for which cohorts exist gets the
    // same reply either way.
    const answer = agent().getSelfReportDivergenceRate('nowhere', WINDOW);

    expect(answer.ok).toBe(false);
    expect(answer.ok === false && answer.reason).toBe('COHORT_TOO_SMALL');
  });

  test('neither answer carries a per-worker state list or any identifier', () => {
    const rate = JSON.stringify(agent().getSelfReportDivergenceRate('factory-a', WINDOW));
    const count = JSON.stringify(agent().getUnmatchedSelfReportCount('factory-a', WINDOW));

    for (const serialised of [rate, count]) {
      expect(serialised).not.toContain('states');
      expect(serialised).not.toContain('DISPUTED');
      expect(serialised).not.toContain('OMITTED');
      expect(serialised).not.toContain('workerDID');
      expect(serialised).not.toContain('zWorker');
    }
  });
});
