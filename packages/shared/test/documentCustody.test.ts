/**
 * 證件保管：三種組合，第三種有刑度。
 *
 * 台灣法律**已經要求**一份與這張憑證高度對應的文件。就業服務法 57-8 禁止雇主非法扣留
 * 移工證件（6 萬～30 萬罰鍰），護照條例 32 條讓非法扣留他人護照成為**刑事犯罪**——
 * 三年以下有期徒刑，不是罰款級距。
 *
 * 合法代管的要件是**勞工主動提出** ＋ 雙語同意書。那份同意書已經是法定文件；我們做的是
 * 它的可驗證版本。
 */
import { describe, expect, test } from 'vitest';
import { classifyCustody, custodyReason } from '@eas/shared';

describe('三種組合', () => {
  test('證件在本人手上：不需要同意書', () => {
    expect(classifyCustody({ passportHeldByWorker: true })).toBe('HELD_BY_WORKER');
    expect(custodyReason('HELD_BY_WORKER')).toBeNull();
  });

  test('他人保管、勞工主動提出、雙語同意書：合法代管', () => {
    expect(
      classifyCustody({
        passportHeldByWorker: false,
        custodyRequestedByWorker: true,
        bilingualConsentProvided: true,
      }),
    ).toBe('LAWFUL_CUSTODY');
  });

  test('他人保管、勞工沒有提出：違法扣留', () => {
    // The case with a criminal penalty behind it, so it gets its own code
    // rather than being folded into a generic policy failure.
    const status = classifyCustody({
      passportHeldByWorker: false,
      custodyRequestedByWorker: false,
    });

    expect(status).toBe('UNLAWFUL_RETENTION');
    expect(custodyReason(status)).toBe('UNLAWFUL_DOCUMENT_RETENTION');
  });
});

describe('要件不足與資料不足是兩回事', () => {
  test('a request without a bilingual form is deficient, not unlawful', () => {
    // The worker did ask; the paperwork does not meet the statutory form.
    // Calling that a criminal retention would be an accusation the facts do
    // not support.
    const status = classifyCustody({
      passportHeldByWorker: false,
      custodyRequestedByWorker: true,
      bilingualConsentProvided: false,
    });

    expect(status).toBe('CONSENT_FORM_DEFICIENT');
    expect(custodyReason(status)).toBe('CUSTODY_CONSENT_DEFICIENT');
  });

  test('an undisclosed custody state is never read as lawful', () => {
    expect(classifyCustody({})).toBe('UNDETERMINED');
    expect(custodyReason('UNDETERMINED')).toBe('CLAIM_NOT_DISCLOSED');
  });

  test('a missing request flag counts as not requested, not as unknown', () => {
    // Once the passport is established to be in someone else's hands, silence
    // about who asked is not neutral: the statute puts the requirement on the
    // party holding the document, so absence of a request is retention.
    expect(classifyCustody({ passportHeldByWorker: false })).toBe('UNLAWFUL_RETENTION');
  });
});

describe('問「是你提出的嗎」，不是「你同意嗎」', () => {
  test('there is no field that turns retention into consented retention', () => {
    // The removed custodyConsentGiven asked whether the worker agreed, which
    // in that power relationship is always answered yes. Nothing in the facts
    // this function accepts can flip UNLAWFUL_RETENTION to lawful except the
    // worker having asked in the first place.
    const held = { passportHeldByWorker: false, custodyRequestedByWorker: false };

    expect(classifyCustody({ ...held, bilingualConsentProvided: true })).toBe(
      'UNLAWFUL_RETENTION',
    );
  });
});
