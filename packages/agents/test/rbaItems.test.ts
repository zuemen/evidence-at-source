import { describe, expect, test } from 'vitest';
import { classifyRbaItem } from '@eas/agents';

describe('RBA item classification (題06 Q3)', () => {
  test('working-hours limits are credential-answerable', () => {
    expect(classifyRbaItem('workingHoursWithinLimit')).toBe('CREDENTIAL_ANSWERABLE');
  });

  test('document custody is credential-answerable', () => {
    expect(classifyRbaItem('passportHeldByWorker')).toBe('CREDENTIAL_ANSWERABLE');
  });

  test('physical safety conditions require an on-site audit', () => {
    expect(classifyRbaItem('fireSafetyConditions')).toBe('REQUIRES_ON_SITE');
  });

  test('an unknown item is UNKNOWN, not silently answerable', () => {
    expect(classifyRbaItem('somethingNew')).toBe('UNKNOWN');
  });
});
