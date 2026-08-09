/**
 * 脅迫訊號：讓 100% 覆蓋率不再自動等於好。
 *
 * 原本的證據完整性指數把「勞工確認率」當正向指標。但強迫全體簽署的工廠會拿到
 * 100%，尊重勞工意願的工廠反而有缺口——指標在這個系統存在的理由上是反向的。
 *
 * 三個訊號全部由既有欄位算出（attestedAt、deviceFingerprint、iat），且全部是
 * 匿名匯總：回傳集中度、重用比例、時間中位數，不回傳是哪一支裝置或哪些人。
 */
import { describe, expect, test } from 'vitest';
import {
  computeCoercionSignals,
  computeEvidenceIntegrityIndex,
  type AttestationRecord,
} from '@eas/agents';

const HOUR = 60 * 60 * 1000;
const base = Date.UTC(2026, 7, 3, 9, 0, 0);

/** A cohort that signed one at a time, on their own devices, after reading. */
function healthy(count: number): AttestationRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    attestedAtMs: base + i * 3 * HOUR,
    issuedAtMs: base + i * 3 * HOUR - 20 * 60 * 1000,
    deviceFingerprint: `sha256:device-${i}`,
  }));
}

/** A cohort marched through a room: one device, one window, no reading time. */
function coerced(count: number): AttestationRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    attestedAtMs: base + i * 30 * 1000,
    issuedAtMs: base + i * 30 * 1000 - 5 * 1000,
    deviceFingerprint: 'sha256:supervisor-tablet',
  }));
}

describe('2-a 簽署時間集中度', () => {
  test('a cohort signing across days has a low concentration', () => {
    expect(computeCoercionSignals(healthy(20)).timeConcentration).toBeLessThan(0.3);
  });

  test('forty people inside one hour concentrates to nearly one', () => {
    expect(computeCoercionSignals(coerced(40)).timeConcentration).toBeGreaterThan(0.9);
  });
});

describe('2-b 裝置重用', () => {
  test('one device per worker reuses nothing', () => {
    expect(computeCoercionSignals(healthy(20)).deviceReuse).toBeCloseTo(0, 5);
  });

  test('one device signing for everybody is total reuse', () => {
    expect(computeCoercionSignals(coerced(20)).deviceReuse).toBeGreaterThan(0.9);
  });
});

describe('2-c 閱讀時間', () => {
  test('twenty minutes between issuance and signature reads as read', () => {
    expect(computeCoercionSignals(healthy(20)).hurriedSignatures).toBeCloseTo(0, 5);
  });

  test('five seconds does not', () => {
    expect(computeCoercionSignals(coerced(20)).hurriedSignatures).toBeGreaterThan(0.9);
  });
});

describe('訊號輸出不得含任何識別資訊', () => {
  test('no device fingerprint, timestamp or worker id survives serialisation', () => {
    const serialised = JSON.stringify(computeCoercionSignals(coerced(20)));

    expect(serialised).not.toContain('supervisor-tablet');
    expect(serialised).not.toContain('sha256');
    expect(serialised).not.toContain(String(base));
    expect(serialised).not.toContain('workerDID');
  });

  test('an empty cohort yields no signal rather than a clean bill of health', () => {
    const signals = computeCoercionSignals([]);

    // Nothing observed must never read as "nothing wrong".
    expect(signals.discount).toBe(0);
    expect(signals.observations).toBe(0);
  });
});

describe('關鍵：誠實工廠的分數必須高於脅迫工廠', () => {
  test('100% coverage under coercion scores below 78% coverage without it', () => {
    const coercedFactory = computeEvidenceIntegrityIndex({
      coverage: 1.0,
      coercion: computeCoercionSignals(coerced(40)),
    });
    const honestFactory = computeEvidenceIntegrityIndex({
      coverage: 0.78,
      coercion: computeCoercionSignals(healthy(31)),
    });

    // The whole point of the task: the metric must stop rewarding coercion.
    expect(coercedFactory.index).toBeLessThan(honestFactory.index ?? 0);
  });

  test('an honest factory keeps almost all of its raw coverage', () => {
    const honest = computeEvidenceIntegrityIndex({
      coverage: 0.78,
      coercion: computeCoercionSignals(healthy(31)),
    });

    // 78 raw; a clean cohort should not be punished for being clean.
    expect(honest.index).toBeGreaterThanOrEqual(75);
  });

  test('without coercion data the index is unchanged from before', () => {
    // Absent signals must not silently discount anyone.
    expect(computeEvidenceIntegrityIndex({ coverage: 0.8, consistency: 0.8 }).index).toBe(80);
  });
});
