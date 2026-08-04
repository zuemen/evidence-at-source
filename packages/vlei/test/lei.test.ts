import { describe, expect, test } from 'vitest';
import { computeLeiCheckDigits, isValidLei, syntheticLei } from '@eas/vlei';

describe('ISO 17442 LEI', () => {
  test('a synthetic LEI is 20 chars and passes mod 97-10 validation', () => {
    const lei = syntheticLei('BANKEXAMPLE');

    expect(lei).toHaveLength(20);
    expect(lei.startsWith('BANKEXAMPLEXXXXXXX')).toBe(true);
    expect(isValidLei(lei)).toBe(true);
  });

  test('check digits are consistent between compute and validate', () => {
    const base = 'AGENCYEXAMPLEXXXXX';
    const lei = base + computeLeiCheckDigits(base);

    expect(isValidLei(lei)).toBe(true);
  });

  test('corrupting any character breaks validation', () => {
    const lei = syntheticLei('FACTORYEXAMPLE');
    const corrupted = (lei[0] === 'A' ? 'B' : 'A') + lei.slice(1);

    expect(isValidLei(corrupted)).toBe(false);
  });

  test('shape violations are rejected', () => {
    expect(isValidLei('short')).toBe(false);
    expect(isValidLei('bankexamplexxxxxxx00')).toBe(false);
    expect(isValidLei('BANKEXAMPLEXXXXXXXAA')).toBe(false);
  });

  test('syntheticLei rejects tags that cannot form a valid base', () => {
    expect(() => syntheticLei('')).toThrow();
    expect(() => syntheticLei('lower')).toThrow();
    expect(() => syntheticLei('X'.repeat(19))).toThrow();
  });
});
