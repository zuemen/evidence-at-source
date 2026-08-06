import { describe, expect, test } from 'vitest';
import { CREDENTIAL_TYPES, getCredentialSchema } from '@eas/shared';

describe('credential schema', () => {
  test('WorkingHoursCredential marks raw hour counts as hidden', () => {
    const schema = getCredentialSchema('WorkingHoursCredential');

    // commitmentSalt is hidden for the same reason the hour counts are: the
    // range of plausible hours is small enough to brute force without a mask.
    expect(schema.hidden).toEqual(['totalHours', 'overtimeHours', 'commitmentSalt']);
    expect(schema.public).toContain('withinRBALimit');
    // The commitment itself must be disclosable — it is a public input to the
    // reconciliation proof.
    expect(schema.public).toContain('valueCommitment');
  });

  test('all credential types from docs/credentials.md have a schema', () => {
    expect([...CREDENTIAL_TYPES]).toEqual([
      'RecruitmentFeeCredential',
      'DocumentCustodyCredential',
      'ContractConsentCredential',
      'WorkingHoursCredential',
      'SalaryDepositCredential',
      'ResidencyCredential',
    ]);
  });

  test('SalaryDepositCredential keeps the deposited amount and count hidden', () => {
    const schema = getCredentialSchema('SalaryDepositCredential');

    expect(schema.hidden).toEqual(['depositedAmountTWD', 'depositCount', 'commitmentSalt']);
    expect(schema.public).toEqual(['periodStart', 'periodEnd', 'issuerType', 'valueCommitment']);
  });

  test('no field is both public and hidden', () => {
    for (const type of CREDENTIAL_TYPES) {
      const schema = getCredentialSchema(type);
      const overlap = schema.public.filter((f) => schema.hidden.includes(f));

      expect(overlap, `${type} leaks ${overlap.join(',')} into public`).toEqual([]);
    }
  });
});
