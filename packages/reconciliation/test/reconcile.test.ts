import { describe, expect, test } from 'vitest';
import { DEFAULT_RECONCILIATION_PARAMS, reconcile } from '@eas/reconciliation';

// Synthetic wage figures. Not a claim about any real statutory rate.
const PARAMS = DEFAULT_RECONCILIATION_PARAMS;

describe('reconcile', () => {
  test('CONSISTENT when the deposit matches the reported hours within tolerance', () => {
    const outcome = reconcile(
      { totalHours: 186, overtimeHours: 42 },
      { depositedAmountTWD: 38000 },
      PARAMS,
    );

    expect(outcome.code).toBe('CONSISTENT');
  });

  test('DISCREPANCY_UNDERPAID when the deposit is well below the expected pay', () => {
    const outcome = reconcile(
      { totalHours: 186, overtimeHours: 42 },
      { depositedAmountTWD: 25000 },
      PARAMS,
    );

    expect(outcome.code).toBe('DISCREPANCY_UNDERPAID');
  });

  test('DISCREPANCY_OVERPAID when the deposit implies more hours than were reported', () => {
    // Reported 150 hours (within limit) but paid as if ~186 were worked: the
    // fingerprint of hours that were simply never recorded.
    const outcome = reconcile(
      { totalHours: 150, overtimeHours: 10 },
      { depositedAmountTWD: 38000 },
      PARAMS,
    );

    expect(outcome.code).toBe('DISCREPANCY_OVERPAID');
  });

  test('INSUFFICIENT_DATA when either credential is missing', () => {
    expect(reconcile({ totalHours: 186, overtimeHours: 42 }, null, PARAMS).code).toBe(
      'INSUFFICIENT_DATA',
    );
    expect(reconcile(null, { depositedAmountTWD: 38000 }, PARAMS).code).toBe('INSUFFICIENT_DATA');
  });

  test('the outcome carries only a code — never an amount or an hour count', () => {
    const outcome = reconcile(
      { totalHours: 150, overtimeHours: 10 },
      { depositedAmountTWD: 38000 },
      PARAMS,
    );

    expect(Object.keys(outcome)).toEqual(['code']);
  });
});
