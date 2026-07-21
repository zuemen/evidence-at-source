import { describe, expect, test } from 'vitest';
import { createBankAgent } from '@eas/agents';

describe('Agent A — bank verifier', () => {
  test('recommends approval but always leaves the decision to a human', () => {
    const agent = createBankAgent();

    const assessment = agent.assess({
      feeWithinLegalCap: true,
      passportHeldByWorker: true,
      nativeLanguageVersionProvided: true,
    });

    expect(assessment.recommendation).toBe('APPROVE_PENDING_HUMAN_REVIEW');
    expect(assessment.requiresHumanReview).toBe(true);
    expect(assessment.reasons).toEqual([]);
  });

  test('declines with a reason code when a required fact was not disclosed', () => {
    const agent = createBankAgent();

    const assessment = agent.assess({
      feeWithinLegalCap: true,
      passportHeldByWorker: true,
    });

    expect(assessment.recommendation).toBe('DECLINE_PENDING_HUMAN_REVIEW');
    expect(assessment.reasons).toContain('CLAIM_NOT_DISCLOSED');
    expect(assessment.requiresHumanReview).toBe(true);
  });

  test('declines when a disclosed fact fails policy, without echoing raw values', () => {
    const agent = createBankAgent();

    const assessment = agent.assess({
      feeWithinLegalCap: false,
      passportHeldByWorker: true,
      nativeLanguageVersionProvided: true,
    });

    expect(assessment.recommendation).toBe('DECLINE_PENDING_HUMAN_REVIEW');
    expect(assessment.reasons.length).toBeGreaterThan(0);
  });

  test('distinguishes a fact that was never disclosed from one that failed policy', () => {
    const agent = createBankAgent();

    const notDisclosed = agent.assess({
      passportHeldByWorker: true,
      nativeLanguageVersionProvided: true,
    });
    const failedPolicy = agent.assess({
      feeWithinLegalCap: false,
      passportHeldByWorker: true,
      nativeLanguageVersionProvided: true,
    });

    expect(notDisclosed.reasons).toEqual(['CLAIM_NOT_DISCLOSED']);
    expect(failedPolicy.reasons).toEqual(['POLICY_CHECK_FAILED']);
  });

  test('exposes no capability beyond assessing', () => {
    const agent = createBankAgent();

    expect(Object.keys(agent)).toEqual(['assess']);
  });
});
