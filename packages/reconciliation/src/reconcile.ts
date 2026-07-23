/**
 * M7 reconciliation — the core comparison.
 *
 * Working hours are asserted by the factory; salary deposits are asserted by a
 * bank or remittance operator. Neither controls the other. If the deposit is
 * larger than the reported hours can justify, hours were worked that nobody
 * wrote down — DISCREPANCY_OVERPAID is the fingerprint of omission-style fraud.
 *
 * The outcome is a single code. It never carries an amount, an hour count, or
 * the expected pay it was computed from — see reconcile.privacy.test.ts.
 */

export const RECONCILIATION_CODES = [
  'CONSISTENT',
  'DISCREPANCY_UNDERPAID',
  'DISCREPANCY_OVERPAID',
  'INSUFFICIENT_DATA',
] as const;

export type ReconciliationCode = (typeof RECONCILIATION_CODES)[number];

export interface ReconciliationParams {
  /** TWD per normal hour. Synthetic and configurable; not a real statutory rate. */
  readonly legalWageRate: number;
  /** Overtime pay multiplier, e.g. 1.34. */
  readonly overtimeMultiplier: number;
  /** Tolerance in basis points. 1500 = 15%, covering board, lodging and lawful deductions. */
  readonly toleranceBps: number;
}

export const DEFAULT_RECONCILIATION_PARAMS: ReconciliationParams = {
  legalWageRate: 190,
  overtimeMultiplier: 1.34,
  toleranceBps: 1500,
};

export interface HoursFacts {
  readonly totalHours: number;
  readonly overtimeHours: number;
}

export interface SalaryFacts {
  readonly depositedAmountTWD: number;
}

export interface ReconciliationOutcome {
  readonly code: ReconciliationCode;
}

export function reconcile(
  hours: HoursFacts | null,
  salary: SalaryFacts | null,
  params: ReconciliationParams,
): ReconciliationOutcome {
  if (hours === null || salary === null) {
    return { code: 'INSUFFICIENT_DATA' };
  }

  const normalHours = hours.totalHours - hours.overtimeHours;
  const expectedPay =
    normalHours * params.legalWageRate +
    hours.overtimeHours * params.legalWageRate * params.overtimeMultiplier;

  const tolerance = (expectedPay * params.toleranceBps) / 10_000;

  if (salary.depositedAmountTWD < expectedPay - tolerance) {
    return { code: 'DISCREPANCY_UNDERPAID' };
  }
  if (salary.depositedAmountTWD > expectedPay + tolerance) {
    return { code: 'DISCREPANCY_OVERPAID' };
  }

  return { code: 'CONSISTENT' };
}
