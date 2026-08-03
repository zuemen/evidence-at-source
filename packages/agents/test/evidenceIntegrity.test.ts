import { describe, expect, test } from 'vitest';
import { computeEvidenceIntegrityIndex } from '@eas/agents';

describe('evidence integrity index', () => {
  test('averages the present components into a 0-100 index with a grade', () => {
    const result = computeEvidenceIntegrityIndex({
      coverage: 1,
      consistency: 1,
      attestation: 1,
    });

    expect(result.index).toBe(100);
    expect(result.grade).toBe('A');
  });

  test('a mixed set produces a proportional index', () => {
    // mean(0.8, 0.7, 0.9) = 0.8 -> 80 -> grade B
    const result = computeEvidenceIntegrityIndex({
      coverage: 0.8,
      consistency: 0.7,
      attestation: 0.9,
    });

    expect(result.index).toBe(80);
    expect(result.grade).toBe('B');
  });

  test('averages only the components that are present', () => {
    // mean(0.6, 0.6) = 0.6 -> 60 -> grade C
    const result = computeEvidenceIntegrityIndex({ coverage: 0.6, consistency: 0.6 });

    expect(result.index).toBe(60);
    expect(result.grade).toBe('C');
  });

  test('a low index grades D', () => {
    const result = computeEvidenceIntegrityIndex({ coverage: 0.4, consistency: 0.5 });

    expect(result.index).toBe(45);
    expect(result.grade).toBe('D');
  });

  test('out-of-range components are clamped to [0,1]', () => {
    const result = computeEvidenceIntegrityIndex({ coverage: 1.5, consistency: -0.2 });

    // clamp -> mean(1, 0) = 0.5 -> 50
    expect(result.index).toBe(50);
  });

  test('no components yields a null index rather than a fabricated score', () => {
    const result = computeEvidenceIntegrityIndex({});

    expect(result.index).toBeNull();
    expect(result.grade).toBeNull();
  });
});
