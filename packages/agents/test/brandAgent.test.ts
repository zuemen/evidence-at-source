import { describe, expect, test } from 'vitest';
import { createBrandAgent } from '@eas/agents';

/** Synthetic cohort: 8 workers, 6 within the RBA limit. No identifiers exist. */
const SYNTHETIC_EVIDENCE = [
  {
    cohort: 'factory-a-2026-08',
    metric: 'workingHoursComplianceRate',
    conclusions: [true, true, true, true, true, true, false, false],
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
    expect(answer.ok === true && answer.rate).toBeCloseTo(0.75);
    expect(answer.ok === true && answer.cohortSize).toBe(8);
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
    expect(answer.ok === false && answer.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });
});
