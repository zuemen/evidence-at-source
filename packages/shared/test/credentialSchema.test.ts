import { describe, expect, test } from 'vitest';
import { CREDENTIAL_TYPES, getCredentialSchema } from '@eas/shared';

describe('credential schema', () => {
  test('WorkingHoursCredential marks raw hour counts as hidden', () => {
    const schema = getCredentialSchema('WorkingHoursCredential');

    expect(schema.hidden).toEqual(['totalHours', 'overtimeHours']);
    expect(schema.public).toContain('withinRBALimit');
  });

  test('all credential types from docs/credentials.md have a schema', () => {
    expect([...CREDENTIAL_TYPES]).toEqual([
      'RecruitmentFeeCredential',
      'DocumentCustodyCredential',
      'ContractConsentCredential',
      'WorkingHoursCredential',
      'SalaryDepositCredential',
    ]);
  });

  test('SalaryDepositCredential keeps the deposited amount and count hidden', () => {
    const schema = getCredentialSchema('SalaryDepositCredential');

    expect(schema.hidden).toEqual(['depositedAmountTWD', 'depositCount']);
    expect(schema.public).toEqual(['periodStart', 'periodEnd', 'issuerType']);
  });

  test('no field is both public and hidden', () => {
    for (const type of CREDENTIAL_TYPES) {
      const schema = getCredentialSchema(type);
      const overlap = schema.public.filter((f) => schema.hidden.includes(f));

      expect(overlap, `${type} leaks ${overlap.join(',')} into public`).toEqual([]);
    }
  });
});
