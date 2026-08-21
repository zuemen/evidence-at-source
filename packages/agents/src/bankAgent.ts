/**
 * Agent A — acts for the bank assessing an account application.
 *
 * It reads disclosed conclusions and produces a recommendation. It cannot open,
 * approve, decline, freeze or move anything: no such function exists in this
 * module, and `requiresHumanReview` is typed as the literal `true` so that no
 * future code path can produce an assessment that claims to be final.
 */

import { meetsEmployerPays, type ReasonCode } from '@eas/shared';

export type Recommendation = 'APPROVE_PENDING_HUMAN_REVIEW' | 'DECLINE_PENDING_HUMAN_REVIEW';

/** Conclusions the worker chose to disclose. Absent means "not disclosed". */
export interface DisclosedFacts {
  /**
   * RBA Employer Pays: the worker paid nothing for the job.
   *
   * This replaced `feeWithinLegalCap`, which tested Taiwan's statutory service
   * fee ceiling — a real rule, and not the one anyone here audits against. A
   * worker carrying NT$30,000 of unreimbursed recruitment debt passed that
   * check, which is precisely the debt bondage the assessment exists to see.
   */
  readonly zeroRecruitmentFeePaid?: boolean;
  /** Reimbursement limb of Employer Pays: paid, then repaid within 90 days. */
  readonly feesReimbursedByEmployer?: boolean;
  readonly reimbursedWithin90Days?: boolean;
  readonly passportHeldByWorker?: boolean;
  readonly nativeLanguageVersionProvided?: boolean;
}

export interface BankAssessment {
  readonly recommendation: Recommendation;
  readonly reasons: readonly ReasonCode[];
  /** Literal `true`: an assessment is never a decision. */
  readonly requiresHumanReview: true;
  /** Anomaly signals for the human reviewer, e.g. MULTIPLE_APPLICATIONS. */
  readonly riskFlags: readonly string[];
}

/** Anonymised anomaly signal from the application monitor (題05 Q3). */
export interface ApplicationRiskSignal {
  readonly flagged: boolean;
}

export interface BankAgent {
  assess(facts: DisclosedFacts, risk?: ApplicationRiskSignal): BankAssessment;
}

const REQUIRED_FACTS = [
  'zeroRecruitmentFeePaid',
  'passportHeldByWorker',
  'nativeLanguageVersionProvided',
] as const satisfies readonly (keyof DisclosedFacts)[];

export function createBankAgent(): BankAgent {
  return {
    assess(facts, risk) {
      const reasons: ReasonCode[] = [];

      // Employer Pays has two limbs: nothing paid, or paid and reimbursed
      // within 90 days. Reading only the first would decline a worker whose
      // employer did exactly what the standard asks.
      const feeFacts: DisclosedFacts = {
        ...facts,
        ...(facts.zeroRecruitmentFeePaid === undefined
          ? {}
          : { zeroRecruitmentFeePaid: meetsEmployerPays(facts) }),
      };

      for (const fact of REQUIRED_FACTS) {
        if (feeFacts[fact] === undefined) {
          reasons.push('CLAIM_NOT_DISCLOSED');
        } else if (feeFacts[fact] === false) {
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
        // A flag informs the human reviewer; it never decides anything itself.
        riskFlags: risk?.flagged === true ? ['MULTIPLE_APPLICATIONS'] : [],
      };
    },
  };
}
