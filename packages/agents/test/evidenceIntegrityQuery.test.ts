import { describe, expect, test } from 'vitest';
import { K_ANONYMITY } from '@eas/shared';
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
  // Twenty with the same 4:1 ratio as before: the figures these tests assert
  // are unchanged, and the cohort now clears the rate threshold that an index
  // or a coverage fraction requires.
  signals: Array.from({ length: K_ANONYMITY.rate }, (_, i) => i % 5 === 4),
};
const RECONCILIATIONS: ReconciliationCohort = {
  cohort: 'factory-a',
  window: WINDOW,
  outcomes: Array.from({ length: K_ANONYMITY.rate }, (_, i) =>
    i % 5 === 4 ? ('DISCREPANCY_OVERPAID' as const) : ('CONSISTENT' as const),
  ),
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
    // The gate runs before anything is looked up, so a cohort that does not
    // exist and a cohort that is too small are indistinguishable from outside.
    // That is deliberate: telling a caller "that cohort exists but is small"
    // is itself a fact about the cohort. This matches what answer() has always
    // done; the integrity queries only just joined it.
    const agent = createBrandAgent([], [], []);

    const answer = agent.getEvidenceIntegrityIndex('nowhere', WINDOW);

    expect(answer.ok).toBe(false);
    expect(answer.ok === false && answer.reason).toBe('COHORT_TOO_SMALL');
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
