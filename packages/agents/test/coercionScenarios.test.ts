/**
 * 兩個情境的實測數字。
 *
 * 這個檔案存在的理由是「證明指標的方向修正了」，而不是「假設它修正了」。
 * 數字由測試印出，任何人跑一次就看得到。
 */
import { describe, expect, test } from 'vitest';
import {
  computeCoercionSignals,
  computeEvidenceIntegrityIndex,
  type AttestationRecord,
} from '@eas/agents';

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 7, 3, 9, 0, 0);

/**
 * 情境 A：脅迫工廠。四十人全部簽了（覆蓋率 100%），但同一支平板、
 * 三十秒一個、憑證發出五秒後就簽。
 */
const COERCED: AttestationRecord[] = Array.from({ length: 40 }, (_, i) => ({
  attestedAtMs: START + i * 30 * 1000,
  issuedAtMs: START + i * 30 * 1000 - 5 * 1000,
  deviceFingerprint: 'sha256:supervisor-tablet',
}));

/**
 * 情境 B：誠實工廠。四十人中三十一人簽了（覆蓋率 78%），各自的裝置、
 * 分散在數日、平均閱讀二十分鐘後才簽。
 */
const HONEST: AttestationRecord[] = Array.from({ length: 31 }, (_, i) => ({
  attestedAtMs: START + i * 3 * HOUR,
  issuedAtMs: START + i * 3 * HOUR - 20 * 60 * 1000,
  deviceFingerprint: `sha256:worker-device-${i}`,
}));

describe('實測：脅迫工廠 vs 誠實工廠', () => {
  test('the honest factory outranks the coerced one, and the numbers are printed', () => {
    const coercedSignals = computeCoercionSignals(COERCED);
    const honestSignals = computeCoercionSignals(HONEST);

    const coerced = computeEvidenceIntegrityIndex({
      coverage: 1.0,
      coercion: coercedSignals,
    });
    const honest = computeEvidenceIntegrityIndex({
      coverage: 0.78,
      coercion: honestSignals,
    });

    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '  情境 A 脅迫工廠（原始覆蓋率 100%）',
        `    時間集中度 ${pct(coercedSignals.timeConcentration)}` +
          `  裝置重用 ${pct(coercedSignals.deviceReuse)}` +
          `  倉促簽署 ${pct(coercedSignals.hurriedSignatures)}`,
        `    脅迫折減 ${pct(coercedSignals.discount)}` +
          `  →  有效覆蓋率 ${pct(1.0 * (1 - coercedSignals.discount))}` +
          `  →  指數 ${coerced.index} 級 ${coerced.grade}`,
        '',
        '  情境 B 誠實工廠（原始覆蓋率 78%）',
        `    時間集中度 ${pct(honestSignals.timeConcentration)}` +
          `  裝置重用 ${pct(honestSignals.deviceReuse)}` +
          `  倉促簽署 ${pct(honestSignals.hurriedSignatures)}`,
        `    脅迫折減 ${pct(honestSignals.discount)}` +
          `  →  有效覆蓋率 ${pct(0.78 * (1 - honestSignals.discount))}` +
          `  →  指數 ${honest.index} 級 ${honest.grade}`,
        '',
      ].join('\n'),
    );

    // The claim this whole task exists to make true.
    expect(coerced.index).toBeLessThan(honest.index ?? 0);
  });

  test('the coerced factory loses its A grade despite perfect raw coverage', () => {
    const coerced = computeEvidenceIntegrityIndex({
      coverage: 1.0,
      coercion: computeCoercionSignals(COERCED),
    });

    expect(coerced.grade).not.toBe('A');
  });

  test('the honest factory is not punished for being honest', () => {
    const honest = computeEvidenceIntegrityIndex({
      coverage: 0.78,
      coercion: computeCoercionSignals(HONEST),
    });

    // Its clean cohort should cost it almost nothing against the raw 78.
    expect(honest.index).toBeGreaterThanOrEqual(77);
  });
});
