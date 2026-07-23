import { describe, expect, test } from 'vitest';
import { createBrandAgent, type ReconciliationCohort } from '@eas/agents';

const WINDOW = '2026-08';

// 6 workers: one overpaid discrepancy, five consistent. No identifiers.
const MIXED: ReconciliationCohort = {
  cohort: 'factory-a',
  window: WINDOW,
  outcomes: [
    'CONSISTENT',
    'CONSISTENT',
    'CONSISTENT',
    'CONSISTENT',
    'CONSISTENT',
    'DISCREPANCY_OVERPAID',
  ],
};

describe('Agent B — payroll reconciliation queries', () => {
  test('getDiscrepancyRate reports the fraction of discrepancies for a large-enough cohort', () => {
    const agent = createBrandAgent([], [MIXED]);

    const answer = agent.getDiscrepancyRate('factory-a', WINDOW);

    expect(answer.ok).toBe(true);
    expect(answer.ok === true && answer.rate).toBeCloseTo(1 / 6);
    expect(answer.ok === true && answer.cohortSize).toBe(6);
  });

  test('checkPayrollConsistency is false when any worker shows a discrepancy', () => {
    const agent = createBrandAgent([], [MIXED]);

    const answer = agent.checkPayrollConsistency('factory-a', WINDOW);

    expect(answer.ok).toBe(true);
    expect(answer.ok === true && answer.consistent).toBe(false);
  });

  test('refuses a cohort too small to protect an individual', () => {
    const agent = createBrandAgent([], [
      { cohort: 'tiny', window: WINDOW, outcomes: ['CONSISTENT', 'DISCREPANCY_OVERPAID'] },
    ]);

    const answer = agent.getDiscrepancyRate('tiny', WINDOW);

    expect(answer.ok).toBe(false);
    expect(answer.ok === false && answer.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });

  test('the answer carries no per-worker outcome list and no identifiers', () => {
    const agent = createBrandAgent([], [MIXED]);

    const answer = agent.getDiscrepancyRate('factory-a', WINDOW);
    const serialised = JSON.stringify(answer);

    expect(serialised).not.toContain('DISCREPANCY_OVERPAID');
    expect(serialised).not.toContain('CONSISTENT');
    expect(serialised).not.toContain('outcomes');
  });

  test('an individual reconciliation query is refused like any other individual query', () => {
    const agent = createBrandAgent([], [MIXED]);

    const answer = agent.answer({ kind: 'individual', workerDID: 'did:key:zWorker001' });

    expect(answer.ok).toBe(false);
    expect(answer.ok === false && answer.reason).toBe('INDIVIDUAL_QUERY_REJECTED');
  });
});
