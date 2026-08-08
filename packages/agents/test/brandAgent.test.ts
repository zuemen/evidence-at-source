import { describe, expect, test } from 'vitest';
import { createBrandAgent } from '@eas/agents';

/** Synthetic cohort: 8 workers, 6 within the RBA limit. No identifiers exist. */
const SYNTHETIC_EVIDENCE = [
  {
    cohort: 'factory-a-2026-08',
    metric: 'workingHoursComplianceRate',
    // Twenty-four with the same 6:2 ratio as before, so the expected rate is
    // unchanged and the cohort now clears the rate threshold.
    conclusions: [
      ...Array.from({ length: 18 }, () => true),
      ...Array.from({ length: 6 }, () => false),
    ],
  },
] as const;

describe('Agent B — brand verifier', () => {
  test('T3: refuses a query aimed at one worker and echoes nothing about them', () => {
    const agent = createBrandAgent(SYNTHETIC_EVIDENCE);

    const answer = agent.answer({ kind: 'individual', workerDID: 'did:key:zWorker001' });

    expect(answer.ok).toBe(false);
    expect(answer.ok === false && answer.reason).toBe('INDIVIDUAL_QUERY_REJECTED');
    expect(JSON.stringify(answer)).not.toContain('zWorker001');
    expect(JSON.stringify(answer)).not.toContain('did:key');
  });

  test('answers an aggregate with a rate and no worker identifiers', () => {
    const agent = createBrandAgent(SYNTHETIC_EVIDENCE);

    const answer = agent.answer({
      kind: 'aggregate',
      metric: 'workingHoursComplianceRate',
      cohort: 'factory-a-2026-08',
    });

    expect(answer.ok).toBe(true);
    expect(answer.ok === true && answer.disclosure === 'rate' && answer.rate).toBeCloseTo(0.75);
    expect(answer.ok === true && answer.cohortSize).toBe(24);
    expect(JSON.stringify(answer)).not.toContain('zWorker');
  });

  test('refuses an aggregate over a cohort too small to protect individuals', () => {
    const agent = createBrandAgent([
      {
        cohort: 'tiny-supplier-2026-08',
        metric: 'workingHoursComplianceRate',
        conclusions: [true, false],
      },
    ]);

    const answer = agent.answer({
      kind: 'aggregate',
      metric: 'workingHoursComplianceRate',
      cohort: 'tiny-supplier-2026-08',
    });

    expect(answer.ok).toBe(false);
    expect(answer.ok === false && answer.reason).toBe('COHORT_TOO_SMALL');
  });

  test('a cohort in the middle band degrades to a universal proposition', () => {
    // Six workers: too few for a rate, enough to say whether anyone differs.
    // Going silent here would be worse than answering — the brand learns
    // nothing actionable from silence, and "not all compliant" is true and
    // says less than "83%" would.
    const agent = createBrandAgent([
      {
        cohort: 'small-line-2026-08',
        metric: 'workingHoursComplianceRate',
        conclusions: [true, true, true, true, true, false],
      },
    ]);

    const answer = agent.answer({
      kind: 'aggregate',
      metric: 'workingHoursComplianceRate',
      cohort: 'small-line-2026-08',
    });

    expect(answer.ok).toBe(true);
    expect(answer.ok === true && answer.disclosure).toBe('universal');
    expect(answer.ok === true && answer.compliant).toBe(false);
    // The count of non-compliant workers must not be recoverable. Checked on
    // the object rather than its JSON, because the reported thresholds legitimately
    // contain a `rate` key — that is the bar, not an answer about anybody.
    expect(Object.keys(answer)).not.toContain('rate');
  });
});
