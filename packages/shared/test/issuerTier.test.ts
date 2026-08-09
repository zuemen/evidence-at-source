import { describe, expect, test } from 'vitest';
import { ISSUER_TIERS, meetsMinimumTier, tierRank } from '@eas/shared';

describe('issuer tier', () => {
  test('ranks self-reported below self-declared below third-party below authority', () => {
    expect(tierRank('SELF_REPORTED')).toBe(0);
    expect(tierRank('SELF_DECLARED')).toBe(1);
    expect(tierRank('THIRD_PARTY_VERIFIED')).toBe(2);
    expect(tierRank('AUTHORITY_CERTIFIED')).toBe(3);
  });

  test('meetsMinimumTier is true only at or above the threshold', () => {
    expect(meetsMinimumTier('THIRD_PARTY_VERIFIED', 'THIRD_PARTY_VERIFIED')).toBe(true);
    expect(meetsMinimumTier('AUTHORITY_CERTIFIED', 'THIRD_PARTY_VERIFIED')).toBe(true);
    expect(meetsMinimumTier('SELF_DECLARED', 'THIRD_PARTY_VERIFIED')).toBe(false);
  });

  test('the ladder is worker self-report, then self-declared, third-party, authority', () => {
    expect([...ISSUER_TIERS]).toEqual([
      'SELF_REPORTED',
      'SELF_DECLARED',
      'THIRD_PARTY_VERIFIED',
      'AUTHORITY_CERTIFIED',
    ]);
  });
});
