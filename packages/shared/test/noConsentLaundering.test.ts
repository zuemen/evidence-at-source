/**
 * 沒有任何憑證可以用「他同意了」把違規變成不違規。
 *
 * `DocumentCustodyCredential` 曾經有一個 `custodyConsentGiven`：護照不在勞工手上，
 * 但只要這個布林是 true，就讀成沒有違規。那是**每一個扣留護照的雇主都會講的那句話**，
 * 而 ILO 的強迫勞動指標把證件扣留本身列為指標，不因當事人是否「同意」而改變——在那個
 * 權力關係裡取得的同意，本來就不構成有效同意。
 *
 * 這個測試是列舉式的：日後任何人在任何一張憑證上加回一個這種形狀的欄位，它就會轉紅。
 */
import { describe, expect, test } from 'vitest';
import { CREDENTIAL_TYPES, getCredentialSchema } from '@eas/shared';

/** Field names that would let a violation be excused by claimed agreement. */
const LAUNDERING_SHAPES = [/consent.*(custody|retention|holding)/i, /(custody|retention).*consent/i];

describe('同意漂白：不留下這種形狀的欄位', () => {
  test('no credential carries a consent-to-custody field', () => {
    const offenders: string[] = [];

    for (const type of CREDENTIAL_TYPES) {
      const schema = getCredentialSchema(type);
      for (const field of [...schema.public, ...schema.hidden]) {
        if (LAUNDERING_SHAPES.some((shape) => shape.test(field))) {
          offenders.push(`${type}.${field}`);
        }
      }
    }

    expect(
      offenders,
      'a consent field that excuses document retention launders the violation it should report',
    ).toEqual([]);
  });

  test('document custody is still reported, just not excusable', () => {
    // Removing the excuse must not remove the signal.
    const schema = getCredentialSchema('DocumentCustodyCredential');

    expect(schema.public).toContain('passportHeldByWorker');
  });

  test('the enumeration covers every credential type, so it cannot pass vacuously', () => {
    expect(CREDENTIAL_TYPES.length).toBeGreaterThan(0);
  });
});
