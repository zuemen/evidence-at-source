/**
 * 差分守門的作用域：時間範圍重疊時嚴格，可證明不相交時放行。
 *
 * 差分攻擊成立的條件，是兩次查詢測量「同一組事實」而母體略有不同——相減即可
 * 孤立出那個差集。一月與二月則是兩次不同的測量：二月減一月只說明總體變動了，
 * 不會揭露任何人在一月的值。
 *
 * 判準是時間範圍是否重疊，不是 window 字串是否相同：jan-oct 與 jan-sep 是兩個
 * 不同的字串，卻是包含關係，相減正好孤立出十月。
 *
 * fail-closed：只有「可證明不相交」才放行；缺少 range 或任何重疊都維持守門。
 */
import { describe, it, expect } from 'vitest';
import { createQuerySession } from '../src/differencing.js';

const roster = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => `rec-${offset + i}`);

const jan = { start: '2026-01-01', end: '2026-01-31' };
const feb = { start: '2026-02-01', end: '2026-02-28' };

describe('重疊區間內：攻擊仍被擋', () => {
  it('同一區間、抽掉 1 人 → 拒絕', () => {
    const s = createQuerySession({ kAnonymity: 20 });
    expect(
      s.submit({ cohort: 'F-001', window: '2026-01', range: jan, recordIds: roster(30) }).ok,
    ).toBe(true);

    const r = s.submit({ cohort: 'F-001', window: '2026-01', range: jan, recordIds: roster(29) });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('DIFFERENCING_ATTACK_DETECTED');
  });

  it('★ 包含關係（jan–oct vs jan–sep）→ 拒絕，字串不同也擋得住', () => {
    const s = createQuerySession({ kAnonymity: 10 });
    const janOct = { start: '2026-01-01', end: '2026-10-31' };
    const janSep = { start: '2026-01-01', end: '2026-09-30' };
    expect(
      s.submit({ cohort: 'F-001', window: 'jan-oct', range: janOct, recordIds: roster(15) }).ok,
    ).toBe(true);

    const r = s.submit({ cohort: 'F-001', window: 'jan-sep', range: janSep, recordIds: roster(12) });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('DIFFERENCING_ATTACK_DETECTED');
  });

  it('未提供 range 時維持守門（fail-closed）', () => {
    const s = createQuerySession({ kAnonymity: 20 });
    expect(s.submit({ cohort: 'F-001', window: '2026-01', recordIds: roster(30) }).ok).toBe(true);

    const r = s.submit({ cohort: 'F-001', window: '2026-02', recordIds: roster(29) });

    expect(r.ok).toBe(false);
  });
});

describe('可證明不相交：正當的持續監控可以進行', () => {
  it('★ 一月 → 二月，3 進 3 出 → 通過', () => {
    const s = createQuerySession({ kAnonymity: 20 });
    expect(
      s.submit({ cohort: 'F-001', window: '2026-01', range: jan, recordIds: roster(30) }).ok,
    ).toBe(true);

    const next = [...roster(27, 3), ...roster(3, 30)];
    const r = s.submit({ cohort: 'F-001', window: '2026-02', range: feb, recordIds: next });

    expect(r.ok).toBe(true);
  });

  it('★ 一月 → 二月，僅 1 人離職 → 通過', () => {
    const s = createQuerySession({ kAnonymity: 20 });
    expect(
      s.submit({ cohort: 'F-001', window: '2026-01', range: jan, recordIds: roster(30) }).ok,
    ).toBe(true);

    const r = s.submit({ cohort: 'F-001', window: '2026-02', range: feb, recordIds: roster(29) });

    expect(r.ok).toBe(true);
  });

  it('連續六期的月度追蹤全部通過', () => {
    const s = createQuerySession({ kAnonymity: 20 });

    for (let m = 1; m <= 6; m += 1) {
      const mm = String(m).padStart(2, '0');
      const r = s.submit({
        cohort: 'F-001',
        window: `2026-${mm}`,
        range: { start: `2026-${mm}-01`, end: `2026-${mm}-28` },
        recordIds: roster(30, m),
      });

      expect(r.ok, `2026-${mm} 應通過`).toBe(true);
    }
  });
});

describe('放行跨期不會削弱單次門檻', () => {
  // 本 repo 的 k-匿名是三段式（rate 20 / minimum 5）：session 自身守的是 floor，
  // 回 COHORT_TOO_SMALL；rate 級的 AGGREGATE_BELOW_K_ANONYMITY 由 brandAgent 的
  // 揭露分級負責。跨期放行不得讓任一層變寬鬆。
  it('母體低於 floor 時，帶了乾淨的區間一樣拒絕', () => {
    const s = createQuerySession({ kAnonymity: 20, minimumCohort: 5 });

    const r = s.submit({ cohort: 'F-001', window: '2026-02', range: feb, recordIds: roster(4) });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('COHORT_TOO_SMALL');
  });

  it('先答過一期之後，新一期的小母體仍被 floor 擋下', () => {
    const s = createQuerySession({ kAnonymity: 20, minimumCohort: 5 });
    expect(
      s.submit({ cohort: 'F-001', window: '2026-01', range: jan, recordIds: roster(30) }).ok,
    ).toBe(true);

    const r = s.submit({ cohort: 'F-001', window: '2026-02', range: feb, recordIds: roster(3) });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('COHORT_TOO_SMALL');
  });
});
