/**
 * 自述工時與雇主申報的五種狀態。
 *
 * 第四列（雇主無紀錄、勞工有自述）是這整個任務的理由：在此之前，
 * 「雇主根本不記錄」是偵測不到的——完整性證明比對的是勞工持有的憑證與工廠的承諾，
 * 兩邊同時為空時沒有任何異常。勞工能自行產生證據，這件事才第一次成為可觀察的事件。
 */
import { describe, expect, test } from 'vitest';
import { reconcileSelfReport, type SelfReportState } from '@eas/agents';

const state = (
  employerHours: number | null,
  selfHours: number | null,
  tolerance = 0.1,
): SelfReportState => reconcileSelfReport({ employerHours, selfHours, toleranceRatio: tolerance });

describe('five-state self-report reconciliation', () => {
  test('employer record with no self-report is NORMAL', () => {
    expect(state(180, null)).toBe('NORMAL');
  });

  test('matching numbers are CONFIRMED — the strongest state available', () => {
    expect(state(180, 182)).toBe('CONFIRMED');
  });

  test('numbers that differ beyond tolerance are DISPUTED', () => {
    expect(state(150, 200)).toBe('DISPUTED');
  });

  test('a self-report with no employer record at all is OMITTED', () => {
    // The state that did not exist before: the factory kept no record and the
    // worker did. Nothing else in this repo can see this.
    expect(state(null, 190)).toBe('OMITTED');
  });

  test('neither side reporting is NO_INFORMATION, not a pass', () => {
    // Silence must never read as compliance.
    expect(state(null, null)).toBe('NO_INFORMATION');
  });

  test('tolerance is configurable and applied symmetrically', () => {
    // 180 vs 198 is exactly 10% — inside a 10% tolerance.
    expect(state(180, 198, 0.1)).toBe('CONFIRMED');
    expect(state(180, 199, 0.1)).toBe('DISPUTED');
    // The same pair under a stricter bar.
    expect(state(180, 190, 0.01)).toBe('DISPUTED');
  });

  test('a self-report lower than the employer filing is still a divergence', () => {
    // Under-reporting by the worker is unusual but not impossible (fear, error).
    // It is a divergence either way; the direction is not the agent's business.
    expect(state(200, 150)).toBe('DISPUTED');
  });
});
