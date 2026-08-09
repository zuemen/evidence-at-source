import { describe, expect, test } from 'vitest';
import {
  ISSUER_TIERS,
  getCredentialSchema,
  meetsMinimumTier,
  tierRank,
  type CredentialType,
} from '@eas/shared';

describe('SELF_REPORTED sits below every institutional tier', () => {
  test('it is the lowest rank', () => {
    expect(tierRank('SELF_REPORTED')).toBe(0);
    expect(tierRank('SELF_DECLARED')).toBe(1);
    expect(tierRank('THIRD_PARTY_VERIFIED')).toBe(2);
    expect(tierRank('AUTHORITY_CERTIFIED')).toBe(3);
  });

  test('a self-report never satisfies a threshold of self-declared or above', () => {
    expect(meetsMinimumTier('SELF_REPORTED', 'SELF_DECLARED')).toBe(false);
    expect(meetsMinimumTier('SELF_REPORTED', 'THIRD_PARTY_VERIFIED')).toBe(false);
    // It clears only its own bar, so a verifier can opt in explicitly.
    expect(meetsMinimumTier('SELF_REPORTED', 'SELF_REPORTED')).toBe(true);
  });

  test('the tier order is the whole ladder, lowest first', () => {
    expect([...ISSUER_TIERS]).toEqual([
      'SELF_REPORTED',
      'SELF_DECLARED',
      'THIRD_PARTY_VERIFIED',
      'AUTHORITY_CERTIFIED',
    ]);
  });
});

describe('SelfReportedHoursCredential schema', () => {
  test('the raw hour count is hidden and only the conclusion is public', () => {
    const schema = getCredentialSchema('SelfReportedHoursCredential' as CredentialType);

    expect(schema.hidden).toContain('reportedHours');
    expect(schema.public).toContain('withinRBALimit');
    // Same discipline as every other credential: a verifier gets the verdict,
    // not the number behind it.
    expect(schema.public).not.toContain('reportedHours');
  });
});
