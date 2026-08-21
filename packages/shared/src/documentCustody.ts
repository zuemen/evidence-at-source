/**
 * Reading a custody record against what the law actually requires.
 *
 * Taiwan already mandates a document that this credential closely mirrors.
 * Employment Service Act art. 57(8) forbids an employer unlawfully retaining a
 * migrant worker's passport, residence permit or property, and the Passport Act
 * art. 32 makes unlawful retention of another person's passport a criminal
 * offence — up to three years' imprisonment, not a fine schedule.
 *
 * Lawful custody turns on the worker having **asked**: they request that the
 * employer or agency hold the document, and both parties sign a custody consent
 * form that must be bilingual and itemised.
 *
 * Note the question this asks. The removed `custodyConsentGiven` asked "did you
 * agree?", which in that power relationship is always answered yes. This asks
 * "did you ask?", which is the requirement the statute actually wrote down and
 * is harder to manufacture after the fact.
 */

import type { ReasonCode } from './reasonCodes.js';

export interface CustodyFacts {
  readonly passportHeldByWorker?: boolean;
  readonly custodyRequestedByWorker?: boolean;
  readonly bilingualConsentProvided?: boolean;
}

export type CustodyStatus =
  /** The document is in the worker's own hands; no consent form is needed. */
  | 'HELD_BY_WORKER'
  /** Someone else holds it, at the worker's own request, bilingually consented. */
  | 'LAWFUL_CUSTODY'
  /** Someone else holds it and the worker did not ask. A criminal offence. */
  | 'UNLAWFUL_RETENTION'
  /** Held by another at the worker's request, but the consent form is deficient. */
  | 'CONSENT_FORM_DEFICIENT'
  /** Not enough was disclosed to say. Never read as any of the above. */
  | 'UNDETERMINED';

export function classifyCustody(facts: CustodyFacts): CustodyStatus {
  if (facts.passportHeldByWorker === true) return 'HELD_BY_WORKER';
  if (facts.passportHeldByWorker !== false) return 'UNDETERMINED';

  // Held by someone else. Whether that is lawful turns on who asked.
  if (facts.custodyRequestedByWorker !== true) return 'UNLAWFUL_RETENTION';

  return facts.bilingualConsentProvided === true ? 'LAWFUL_CUSTODY' : 'CONSENT_FORM_DEFICIENT';
}

/** The reason code a verifier reports, or null where nothing is wrong. */
export function custodyReason(status: CustodyStatus): ReasonCode | null {
  if (status === 'UNLAWFUL_RETENTION') return 'UNLAWFUL_DOCUMENT_RETENTION';
  if (status === 'CONSENT_FORM_DEFICIENT') return 'CUSTODY_CONSENT_DEFICIENT';
  if (status === 'UNDETERMINED') return 'CLAIM_NOT_DISCLOSED';

  return null;
}
