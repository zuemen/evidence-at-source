import { describe, expect, test } from 'vitest';
import { K_ANONYMITY } from '@eas/shared';
import { checkQueryLayer } from '@eas/agents';

const AGGREGATE = {
  kind: 'aggregate',
  metric: 'workingHoursComplianceRate',
  cohort: 'factory-a-2026-08',
} as const;

describe('Policy Gate L2 — query layer', () => {
  test('T3: rejects a query aimed at an individual worker', () => {
    const result = checkQueryLayer(
      { kind: 'individual', workerDID: 'did:key:zWorker001' },
      { cohortSize: 500 },
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('INDIVIDUAL_QUERY_REJECTED');
  });

  // The four boundaries of the two-tier bar. Each one is the first or last
  // value of a band, because those are the values a refactor gets wrong.

  test(`below the floor (${K_ANONYMITY.minimum - 1}) nothing is answered at all`, () => {
    const result = checkQueryLayer(AGGREGATE, { cohortSize: K_ANONYMITY.minimum - 1 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('COHORT_TOO_SMALL');
  });

  test(`at the floor (${K_ANONYMITY.minimum}) a universal proposition is answerable`, () => {
    const result = checkQueryLayer(AGGREGATE, {
      cohortSize: K_ANONYMITY.minimum,
      disclosure: 'universal',
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.disclosure).toBe('universal');
  });

  test(`at the floor (${K_ANONYMITY.minimum}) a rate is still refused`, () => {
    // The distinction the whole design rests on: 80% over five workers says
    // exactly one person differs; "are they all compliant" does not.
    const result = checkQueryLayer(AGGREGATE, {
      cohortSize: K_ANONYMITY.minimum,
      disclosure: 'rate',
    });

    expect(result.ok === false && result.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });

  test(`one below the rate bar (${K_ANONYMITY.rate - 1}) refuses a rate`, () => {
    const result = checkQueryLayer(AGGREGATE, {
      cohortSize: K_ANONYMITY.rate - 1,
      disclosure: 'rate',
    });

    expect(result.ok === false && result.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });

  test(`at the rate bar (${K_ANONYMITY.rate}) a rate is answerable`, () => {
    const result = checkQueryLayer(AGGREGATE, {
      cohortSize: K_ANONYMITY.rate,
      disclosure: 'rate',
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.disclosure).toBe('rate');
  });

  test('a caller that does not say what it will publish is treated as asking for a rate', () => {
    // The safer default. A caller that has not thought about disclosure should
    // meet the stricter bar rather than quietly clear the looser one.
    const result = checkQueryLayer(AGGREGATE, { cohortSize: K_ANONYMITY.minimum });

    expect(result.ok === false && result.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });

  test('the decision reports the thresholds it applied', () => {
    const result = checkQueryLayer(AGGREGATE, { cohortSize: K_ANONYMITY.rate });

    expect(result.ok === true && result.thresholds).toEqual(K_ANONYMITY);
  });

  test('thresholds are configurable per verifier', () => {
    const strict = { rate: 50, minimum: 10 };

    const result = checkQueryLayer(AGGREGATE, { cohortSize: 20, thresholds: strict });

    expect(result.ok === false && result.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });
});
