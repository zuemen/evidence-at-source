import { describe, expect, test } from 'vitest';
import {
  createBrandAgent,
  type OmissionCohort,
  type ReconciliationCohort,
} from '@eas/agents';

const WINDOW = '2026-08';

// 5 records: 4 covered (1 omission) -> coverage 0.8; 4 consistent (1 discrepancy) -> consistency 0.8.
const OMISSIONS: OmissionCohort = {
  cohort: 'factory-a',
  window: WINDOW,
  signals: [false, false, false, false, true],
};
const RECONCILIATIONS: ReconciliationCohort = {
  cohort: 'factory-a',
  window: WINDOW,
  outcomes: ['CONSISTENT', 'CONSISTENT', 'CONSISTENT', 'CONSISTENT', 'DISCREPANCY_OVERPAID'],
};

describe('Agent B — evidence integrity index query', () => {
  test('composes commitment coverage and reconciliation consistency into an index', () => {
    const agent = createBrandAgent([], [RECONCILIATIONS], [OMISSIONS]);

    const answer = agent.getEvidenceIntegrityIndex('factory-a', WINDOW);

    expect(answer.ok).toBe(true);
    // mean(0.8, 0.8) = 0.8 -> 80 -> B
    expect(answer.ok === true && answer.index).toBe(80);
    expect(answer.ok === true && answer.grade).toBe('B');
  });

  test('refuses when neither integrity cohort is available', () => {
    const agent = createBrandAgent([], [], []);

    const answer = agent.getEvidenceIntegrityIndex('nowhere', WINDOW);

    expect(answer.ok).toBe(false);
    expect(answer.ok === false && answer.reason).toBe('CLAIM_NOT_DISCLOSED');
  });

  test('the answer carries no per-worker signal list and no identifiers', () => {
    const agent = createBrandAgent([], [RECONCILIATIONS], [OMISSIONS]);

    const serialised = JSON.stringify(agent.getEvidenceIntegrityIndex('factory-a', WINDOW));

    expect(serialised).not.toContain('signals');
    expect(serialised).not.toContain('outcomes');
    expect(serialised).not.toContain('DISCREPANCY_OVERPAID');
    expect(serialised).not.toContain('workerDID');
  });
});
