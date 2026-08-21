/**
 * 招募費判準：合乎台灣法規 ≠ 合乎 RBA。
 *
 * 這張憑證原本只公開一個布林 `feeWithinLegalCap`——依台灣法定服務費上限（每月 1,800／
 * 1,700／1,500 元）。那是一條真實存在的法規，**但不是驗證方在用的那一條。**
 *
 * RBA Code of Conduct 8.0 採 Employer Pays：勞工不該為了一份工作付任何錢；已支付的
 * 須在就業開始後 **90 天內**償還。
 *
 * F1 是這個檔案存在的理由：一個勞工付了三萬元、金額在台灣上限內、雇主從未償還——
 * 台灣法規下沒有問題，RBA 下是明確違規。舊欄位會回 `true`，而套用 RBA 的品牌會把它
 * 讀成合規。**那不是精確度不足，是答錯題。**
 */
import { describe, expect, test } from 'vitest';
import { claimWithinStandards, meetsEmployerPays } from '@eas/shared';
import { createBankAgent } from '@eas/agents';

const RBA_ONLY = ['RBA-CoC-8.0'];

describe('F1：合乎台灣法規，同時違反 RBA', () => {
  /** Paid NT$30,000, inside Taiwan's ceiling, never reimbursed. */
  const paidWithinCap = {
    zeroRecruitmentFeePaid: false,
    feesReimbursedByEmployer: false,
    reimbursedWithin90Days: false,
    withinTaiwanLegalCap: true,
  };

  test('the two standards disagree about the same worker', () => {
    // The whole point, pinned. If these ever agree, one of them is being
    // computed wrongly.
    expect(paidWithinCap.withinTaiwanLegalCap).toBe(true);
    expect(meetsEmployerPays(paidWithinCap)).toBe(false);
  });

  test('the bank declines on the RBA criterion, not the local one', () => {
    const assessment = createBankAgent().assess({
      ...paidWithinCap,
      passportHeldByWorker: true,
      nativeLanguageVersionProvided: true,
    });

    expect(assessment.recommendation).toBe('DECLINE_PENDING_HUMAN_REVIEW');
    expect(assessment.reasons).toContain('POLICY_CHECK_FAILED');
  });
});

describe('F2：付了錢，雇主 60 天內償還', () => {
  const reimbursed = {
    zeroRecruitmentFeePaid: false,
    feesReimbursedByEmployer: true,
    reimbursedWithin90Days: true,
  };

  test('Employer Pays is satisfied by the reimbursement limb', () => {
    expect(meetsEmployerPays(reimbursed)).toBe(true);
  });

  test('the compliant employer is not punished for having charged then repaid', () => {
    // A verifier reading only `zeroRecruitmentFeePaid` would decline here,
    // which would penalise exactly the behaviour the standard asks for.
    const assessment = createBankAgent().assess({
      ...reimbursed,
      passportHeldByWorker: true,
      nativeLanguageVersionProvided: true,
    });

    expect(assessment.recommendation).toBe('APPROVE_PENDING_HUMAN_REVIEW');
  });
});

describe('F3：付了錢，雇主 120 天後才償還', () => {
  test('reimbursement outside the 90-day window does not satisfy the standard', () => {
    // The deadline is part of the rule, not a nicety. Reimbursement a year
    // later leaves the worker carrying the debt for a year.
    expect(
      meetsEmployerPays({
        zeroRecruitmentFeePaid: false,
        feesReimbursedByEmployer: true,
        reimbursedWithin90Days: false,
      }),
    ).toBe(false);
  });

  test('an undisclosed limb is treated as not established, never as satisfied', () => {
    expect(meetsEmployerPays({ zeroRecruitmentFeePaid: false })).toBe(false);
    expect(meetsEmployerPays({})).toBe(false);
  });
});

describe('F4：授權範圍外的判準問不得', () => {
  test('an RBA-scoped agent may ask the RBA criterion', () => {
    expect(claimWithinStandards('zeroRecruitmentFeePaid', RBA_ONLY)).toBe(true);
  });

  test('the same agent may not ask about Taiwan’s statutory ceiling', () => {
    // Not "we would rather it did not" — it has no standing. The answer would
    // be meaningless to its audit, or worse, read as compliance with a
    // standard it never tested.
    expect(claimWithinStandards('withinTaiwanLegalCap', RBA_ONLY)).toBe(false);
  });

  test('a mandate covering both standards may ask either', () => {
    const both = ['RBA-CoC-8.0', 'TW-ESA'];

    expect(claimWithinStandards('zeroRecruitmentFeePaid', both)).toBe(true);
    expect(claimWithinStandards('withinTaiwanLegalCap', both)).toBe(true);
  });

  test('standard-neutral claims stay askable', () => {
    // Whether a passport is in someone's hand is a fact, not a judgement under
    // a ruleset, so no standard gates it.
    expect(claimWithinStandards('passportHeldByWorker', RBA_ONLY)).toBe(true);
  });

  test('a mandate that declares no standards is unrestricted', () => {
    // Narrowing an unstated scope would silently refuse queries nobody meant
    // to forbid.
    expect(claimWithinStandards('withinTaiwanLegalCap', undefined)).toBe(true);
  });
});
