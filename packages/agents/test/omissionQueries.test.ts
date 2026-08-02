import { describe, expect, test } from 'vitest';
import { createBrandAgent, type OmissionCohort } from '@eas/agents';

const WINDOW = '2026-08';

// Five workers, one of them omitted from the factory's commitment. No identifiers.
const COHORT: OmissionCohort = {
  cohort: 'factory-a',
  window: WINDOW,
  signals: [false, false, false, false, true],
};

describe('Agent B — omission queries', () => {
  test('getOmissionSignalCount returns the number of omissions, not who', () => {
    const agent = createBrandAgent([], [], [COHORT]);

    const answer = agent.getOmissionSignalCount('factory-a', WINDOW);

    expect(answer.ok).toBe(true);
    expect(answer.ok === true && answer.count).toBe(1);
  });

  test('getCommitmentCoverage returns the fraction of records the commitment covers', () => {
    const agent = createBrandAgent([], [], [COHORT]);

    const answer = agent.getCommitmentCoverage('factory-a', WINDOW);

    expect(answer.ok).toBe(true);
    expect(answer.ok === true && answer.coverage).toBeCloseTo(4 / 5);
  });

  test('the omission answers carry no per-worker signal list and no identifiers', () => {
    const agent = createBrandAgent([], [], [COHORT]);

    const count = JSON.stringify(agent.getOmissionSignalCount('factory-a', WINDOW));
    const coverage = JSON.stringify(agent.getCommitmentCoverage('factory-a', WINDOW));

    for (const serialised of [count, coverage]) {
      expect(serialised).not.toContain('signals');
      expect(serialised).not.toContain('workerDID');
      // No per-worker array of any kind travels back — only scalars.
      expect(serialised).not.toContain('[');
    }
  });
});
