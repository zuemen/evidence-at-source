import { describe, expect, test } from 'vitest';
import { DEFAULT_RECONCILIATION_PARAMS, reconcile } from '@eas/reconciliation';

/**
 * The non-negotiable privacy property of M7: its output is a verdict, not the
 * evidence behind it. This guard serialises every outcome and asserts that
 * neither the input numbers nor the names of any raw field appear in it.
 *
 * Verified to fail when a leak is introduced — see the session log; the fix for
 * a red here is to stop returning the value, never to relax the assertion.
 */

const FORBIDDEN_FIELD_NAMES = [
  'depositedAmountTWD',
  'depositCount',
  'totalHours',
  'overtimeHours',
  'expectedPay',
  'expected',
  'tolerance',
];

const CASES: ReadonlyArray<{ hours: { totalHours: number; overtimeHours: number }; salary: { depositedAmountTWD: number } }> = [
  { hours: { totalHours: 186, overtimeHours: 42 }, salary: { depositedAmountTWD: 38000 } },
  { hours: { totalHours: 150, overtimeHours: 10 }, salary: { depositedAmountTWD: 38000 } },
  { hours: { totalHours: 186, overtimeHours: 42 }, salary: { depositedAmountTWD: 25000 } },
];

describe('M7 privacy guard', () => {
  test('no outcome leaks a raw amount, an hour count, or a raw field name', () => {
    for (const { hours, salary } of CASES) {
      const serialised = JSON.stringify(reconcile(hours, salary, DEFAULT_RECONCILIATION_PARAMS));

      for (const field of FORBIDDEN_FIELD_NAMES) {
        expect(serialised, `outcome leaked field name ${field}`).not.toContain(field);
      }

      for (const value of [hours.totalHours, hours.overtimeHours, salary.depositedAmountTWD]) {
        expect(serialised, `outcome leaked value ${value}`).not.toContain(String(value));
      }
    }
  });
});
