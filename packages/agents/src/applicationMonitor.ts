/**
 * Cross-institution application-frequency monitor — 題05 Q3.
 *
 * "什麼樣的異常模式（例如同一身份短時間內多次申辦不同帳戶）應該被系統自動攔截？"
 * That pattern is the classic mule-account fingerprint: one identity opening
 * accounts at several institutions inside a few days.
 *
 * Two properties matter more than the detection itself.
 *
 * **It counts and nothing else.** `record` takes a worker and a time. It has
 * no parameter for which institution the application went to, so a verifier
 * holding this monitor cannot learn where else someone applied — the
 * information is not withheld, it was never collected. A brand or a bank
 * learning "this person also applied at three competitors" would be a
 * surveillance tool wearing a fraud-prevention badge.
 *
 * **It never decides.** The output is a flag for a human reviewer. Nothing in
 * this repository turns a flag into a refusal, and `BankAssessment.requiresHumanReview`
 * is the literal `true`, so no future code path can produce an assessment that
 * claims to be final. An automated system that closed accounts on a frequency
 * heuristic would hurt exactly the people this project exists to protect —
 * a worker who changes employer legitimately applies more than once.
 */

export interface ApplicationRisk {
  /** Applications inside the window. Never *where* they went. */
  readonly count: number;
  readonly flagged: boolean;
}

export interface ApplicationMonitor {
  /** Records one application. `at` is injectable so tests need no clock. */
  record(workerDid: string, at?: Date): void;
  risk(workerDid: string, at?: Date): ApplicationRisk;
}

export const DEFAULT_APPLICATION_THRESHOLD = 3;

/**
 * Fourteen days.
 *
 * The pattern being looked for is "短時間內" — a burst, not a life history. A
 * counter with no window would eventually flag every long-staying worker, and
 * a signal that everyone trips is one reviewers learn to ignore. Long enough
 * to span a broker walking someone between banks in a fortnight; short enough
 * that a worker who changed jobs last year is not still carrying it.
 */
export const DEFAULT_APPLICATION_WINDOW_DAYS = 14;

export function createApplicationMonitor(
  options: { readonly threshold?: number; readonly windowDays?: number } = {},
): ApplicationMonitor {
  const threshold = options.threshold ?? DEFAULT_APPLICATION_THRESHOLD;
  const windowMs = (options.windowDays ?? DEFAULT_APPLICATION_WINDOW_DAYS) * 24 * 60 * 60 * 1000;

  /** Timestamps only. No institution, no amount, no application id. */
  const applications = new Map<string, number[]>();

  function within(workerDid: string, at: Date): number[] {
    const cutoff = at.getTime() - windowMs;

    return (applications.get(workerDid) ?? []).filter((stamp) => stamp >= cutoff);
  }

  return {
    record(workerDid, at = new Date()) {
      const kept = within(workerDid, at);
      kept.push(at.getTime());
      // Older entries are dropped rather than kept and ignored: data not held
      // cannot be handed over later under a different justification.
      applications.set(workerDid, kept);
    },

    risk(workerDid, at = new Date()) {
      const count = within(workerDid, at).length;

      return { count, flagged: count > threshold };
    },
  };
}
