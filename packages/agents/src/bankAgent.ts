/**
 * Agent A — acts for the bank assessing an account application.
 *
 * It reads disclosed conclusions and produces a recommendation. It cannot open,
 * approve, decline, freeze or move anything: no such function exists in this
 * module, and `requiresHumanReview` is typed as the literal `true` so that no
 * future code path can produce an assessment that claims to be final.
 */

import type { ReasonCode } from '@eas/shared';

export type Recommendation = 'APPROVE_PENDING_HUMAN_REVIEW' | 'DECLINE_PENDING_HUMAN_REVIEW';

/** Conclusions the worker chose to disclose. Absent means "not disclosed". */
export interface DisclosedFacts {
  readonly feeWithinLegalCap?: boolean;
  readonly passportHeldByWorker?: boolean;
  readonly nativeLanguageVersionProvided?: boolean;
}

export interface BankAssessment {
  readonly recommendation: Recommendation;
  readonly reasons: readonly ReasonCode[];
  /** Literal `true`: an assessment is never a decision. */
  readonly requiresHumanReview: true;
}

export interface BankAgent {
  assess(facts: DisclosedFacts): BankAssessment;
}

const REQUIRED_FACTS = [
  'feeWithinLegalCap',
  'passportHeldByWorker',
  'nativeLanguageVersionProvided',
] as const satisfies readonly (keyof DisclosedFacts)[];

export function createBankAgent(): BankAgent {
  return {
    assess(facts) {
      const reasons: ReasonCode[] = [];

      for (const fact of REQUIRED_FACTS) {
        if (facts[fact] === undefined) {
          reasons.push('CLAIM_NOT_DISCLOSED');
        } else if (facts[fact] === false) {
          // Disclosed and failing is a different situation from never disclosed,
          // and a human reviewer needs to be able to tell them apart. Neither
          // code carries the underlying value.
          reasons.push('POLICY_CHECK_FAILED');
        }
      }

      return {
        recommendation:
          reasons.length === 0 ? 'APPROVE_PENDING_HUMAN_REVIEW' : 'DECLINE_PENDING_HUMAN_REVIEW',
        reasons,
        requiresHumanReview: true,
      };
    },
  };
}
