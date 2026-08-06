import { describe, expect, test } from 'vitest';
import { createBrandAgent } from '@eas/agents';

const agent = createBrandAgent([]);

describe('the brand agent answers which RBA items a credential can settle', () => {
  test('a credential-answerable item is accepted', () => {
    expect(agent.answerRbaItem('workingHoursWithinLimit')).toEqual({
      ok: true,
      item: 'workingHoursWithinLimit',
      answerable: true,
    });
  });

  test('an on-site item is refused specifically, not generically', () => {
    expect(agent.answerRbaItem('dormitoryLivingConditions')).toEqual({
      ok: false,
      reason: 'REQUIRES_ONSITE_AUDIT',
    });
  });

  test('an unlisted item is refused rather than quietly answered', () => {
    expect(agent.answerRbaItem('somethingNobodyClassified')).toEqual({
      ok: false,
      reason: 'CLAIM_NOT_DISCLOSED',
    });
  });
});
