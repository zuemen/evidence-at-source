/**
 * LLM 一致性守門。
 *
 * 這個模組讓語言模型的存在有安全上的意義。把 LLM 放進判斷路徑會摧毀「結論可複現」
 * 這個正確的性質；正確的作法是讓它留在最後一步，然後**檢查它說的話有沒有和已經
 * 作成的結論矛盾**。矛盾就丟掉，改用確定性樣板。
 *
 * 守門本身是純規則，不含任何 LLM——否則就是用一個會被騙的東西去守另一個會被騙的
 * 東西。
 */
import { describe, expect, test } from 'vitest';
import {
  checkExplanation,
  guardExplainer,
  offlineExplainer,
  type ExplainableDecision,
  type Explainer,
} from '@eas/explain';

const DECLINE: ExplainableDecision = {
  recommendation: 'DECLINE_PENDING_HUMAN_REVIEW',
  reasons: ['POLICY_CHECK_FAILED'],
  riskFlags: [],
};

const APPROVE: ExplainableDecision = {
  recommendation: 'APPROVE_PENDING_HUMAN_REVIEW',
  reasons: [],
  riskFlags: [],
};

/** An explainer that says whatever it is told to, standing in for a model. */
const saying = (text: string): Explainer => async () => ({ text, source: 'model' });

describe('檢查一：結論詞矛盾', () => {
  test('an explanation recommending approval over a decline is rejected', () => {
    const violations = checkExplanation('綜合判斷，建議核准這筆申請。', DECLINE);

    expect(violations).toContain('CONTRADICTS_RECOMMENDATION');
  });

  test('an explanation recommending decline over an approval is rejected', () => {
    const violations = checkExplanation('資料不足，建議婉拒。', APPROVE);

    expect(violations).toContain('CONTRADICTS_RECOMMENDATION');
  });

  test('an explanation agreeing with the decision passes', () => {
    expect(checkExplanation('建議婉拒，因為必要事實未揭露。', DECLINE)).toEqual([]);
  });
});

describe('檢查二：揭露未揭露的欄位', () => {
  test('a number the decision never disclosed is rejected', () => {
    const violations = checkExplanation('該勞工本期工時為 186 小時，超出上限。', DECLINE);

    expect(violations).toContain('REVEALS_UNDISCLOSED_VALUE');
  });

  test('a number that was disclosed is allowed', () => {
    const withValue: ExplainableDecision = { ...DECLINE, disclosedValues: ['186'] };

    expect(checkExplanation('工時 186 小時。', withValue)).not.toContain(
      'REVEALS_UNDISCLOSED_VALUE',
    );
  });

  test('reason codes and flags may be quoted verbatim', () => {
    // They are part of the decision, so repeating them reveals nothing new.
    const violations = checkExplanation(
      '建議婉拒。原因碼：POLICY_CHECK_FAILED。仍待人類覆核。',
      DECLINE,
    );

    expect(violations).toEqual([]);
  });
});

describe('檢查三：宣稱最終決定', () => {
  // Written out rather than generated. docsConsistency counts test cases
  // statically to verify the numbers the public documents claim, so table-driven
  // generation would make that count inexact — and it rejects the generating
  // helpers by name, including inside comments, which is how this one was
  // caught.
  test('rejects 已核准', () => {
    expect(checkExplanation('本申請已核准。', APPROVE)).toContain('CLAIMS_FINAL_DECISION');
  });

  test('rejects 已通過', () => {
    expect(checkExplanation('審核已通過。', APPROVE)).toContain('CLAIMS_FINAL_DECISION');
  });

  test('rejects 已開立', () => {
    expect(checkExplanation('帳戶已開立完成。', APPROVE)).toContain('CLAIMS_FINAL_DECISION');
  });

  test('the word 建議 is not a claim of finality', () => {
    expect(checkExplanation('建議核准，待人類覆核。', APPROVE)).toEqual([]);
  });
});

describe('守門的行為：丟棄並改用樣板', () => {
  test('a contradicting model explanation is discarded for the offline template', async () => {
    const guarded = guardExplainer(saying('建議核准這筆申請。'));

    const result = await guarded(DECLINE);

    expect(result.source).toBe('offline');
    expect(result.text).not.toContain('建議核准');
    expect(result.rejected).toContain('CONTRADICTS_RECOMMENDATION');
  });

  test('a clean model explanation is passed through untouched', async () => {
    const clean = '建議婉拒，仍待人類覆核。';
    const guarded = guardExplainer(saying(clean));

    const result = await guarded(DECLINE);

    expect(result.text).toBe(clean);
    expect(result.source).toBe('model');
    expect(result.rejected).toBeUndefined();
  });

  test('the substituted text is the same one the offline explainer produces', async () => {
    const guarded = guardExplainer(saying('已核准。'));

    const guardedResult = await guarded(APPROVE);
    const offlineResult = await offlineExplainer(APPROVE);

    expect(guardedResult.text).toBe(offlineResult.text);
  });
});

describe('離線要求：LLM 完全不可用時系統照常運作', () => {
  test('an explainer that throws degrades to the template rather than failing', async () => {
    const broken: Explainer = async () => {
      throw new Error('no API key');
    };

    const result = await guardExplainer(broken)(DECLINE);

    expect(result.source).toBe('offline');
    expect(result.text).toContain('DECLINE_PENDING_HUMAN_REVIEW');
    expect(result.degradedFrom).toBeDefined();
  });

  test('the guard itself contains no model call: it is synchronous and pure', () => {
    // A guard that needed the network could be taken down by the same outage
    // it is supposed to survive, and a guard that asked a model to check a
    // model could be talked out of its answer by the same injection.
    expect(checkExplanation('建議核准。', DECLINE)).toEqual(['CONTRADICTS_RECOMMENDATION']);
  });
});
