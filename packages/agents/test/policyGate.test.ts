import { describe, expect, test } from 'vitest';
import { K_ANONYMITY_THRESHOLD, checkQueryLayer } from '@eas/agents';

describe('Policy Gate L2 — query layer', () => {
  test('T3: rejects a query aimed at an individual worker', () => {
    const result = checkQueryLayer(
      { kind: 'individual', workerDID: 'did:key:zWorker001' },
      { cohortSize: 500 },
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('INDIVIDUAL_QUERY_REJECTED');
  });

  test('rejects an aggregate whose cohort is too small to hide an individual', () => {
    const result = checkQueryLayer(
      { kind: 'aggregate', metric: 'workingHoursComplianceRate', cohort: 'factory-a-2026-08' },
      { cohortSize: K_ANONYMITY_THRESHOLD - 1 },
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });

  test('allows an aggregate over a cohort large enough to protect individuals', () => {
    const result = checkQueryLayer(
      { kind: 'aggregate', metric: 'workingHoursComplianceRate', cohort: 'factory-a-2026-08' },
      { cohortSize: K_ANONYMITY_THRESHOLD },
    );

    expect(result.ok).toBe(true);
  });
});
