/**
 * Field-level disclosure rules for every credential type.
 *
 * This table is the machine-readable form of docs/credentials.md. The issuer
 * derives the SD-JWT `_sd` array from it, so "which fields must stay hidden"
 * is never a decision an implementer can forget to make.
 */

export const CREDENTIAL_TYPES = [
  'RecruitmentFeeCredential',
  'DocumentCustodyCredential',
  'ContractConsentCredential',
  'WorkingHoursCredential',
  'SalaryDepositCredential',
  'ResidencyCredential',
  'SelfReportedHoursCredential',
] as const;

export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export interface DisclosureSchema {
  /** Claims always visible to a verifier. Conclusions only, never raw values. */
  readonly public: readonly string[];
  /** Claims placed in `_sd`, disclosed only when the worker chooses to. */
  readonly hidden: readonly string[];
}

const SCHEMAS: Record<CredentialType, DisclosureSchema> = {
  /**
   * Two standards, kept apart on purpose.
   *
   * This credential used to publish one boolean, `feeWithinLegalCap`, against
   * Taiwan's statutory monthly service-fee ceiling. That is a real legal test.
   * It is not the test the verifier applies.
   *
   * RBA Code of Conduct 8.0 uses Employer Pays: workers shall not be required
   * to pay recruitment fees at all, and anything already paid must be
   * reimbursed within 90 days of employment starting. A factory can sit
   * comfortably inside Taiwan's ceiling and be in plain breach of RBA — a
   * worker who paid NT$30,000 that was never reimbursed passes one and fails
   * the other.
   *
   * A brand auditing against RBA that receives `feeWithinLegalCap: true` reads
   * it as compliance. That is not an imprecise answer, it is an answer to a
   * different question, so the criteria are split and each names its standard.
   */
  RecruitmentFeeCredential: {
    public: [
      'zeroRecruitmentFeePaid',
      'feesReimbursedByEmployer',
      'reimbursedWithin90Days',
      'withinTaiwanLegalCap',
      'standardVersion',
    ],
    hidden: ['feeAmount', 'paymentSchedule', 'lenderName'],
  },
  /**
   * There is no consent-to-custody field here, and that is deliberate.
   *
   * One used to exist, so that `passportHeldByWorker: false` plus consent read
   * as "not a violation". That is the laundering path for passport
   * confiscation — "he agreed to it" is what every employer says, and the ILO
   * forced-labour indicators count document retention regardless of consent,
   * because consent obtained inside that power relationship is not consent.
   *
   * A field that can turn a violation into a non-violation is worse than no
   * field. This one was also read by no check at all, which made it purely a
   * liability: a public field is a field that can leak.
   */
  DocumentCustodyCredential: {
    public: ['passportHeldByWorker', 'documentType'],
    hidden: ['documentHash', 'custodyLocation'],
  },
  ContractConsentCredential: {
    public: ['nativeLanguageVersionProvided', 'language', 'consentTimestamp'],
    hidden: ['salaryAmount', 'contractDocumentHash'],
  },
  // valueCommitment is public because the verifier needs it as a public input
  // to the reconciliation proof; commitmentSalt is hidden because disclosing it
  // would let anyone brute force the small range of plausible hour counts.
  /**
   * Weeks and months are different units, and RBA has requirements we had none
   * of.
   *
   * RBA CoC 8.0 caps a week at 60 hours including overtime, requires one day
   * of rest in seven, and requires that all overtime be voluntary. Taiwan's
   * Labor Standards Act counts monthly instead — 46 overtime hours a month —
   * so the same timesheet can clear one and breach the other. Four weeks at 58
   * hours is compliant every week and far over the monthly ceiling.
   *
   * Two criteria, two fields. Making one boolean answer both questions is the
   * mistake the recruitment fee credential already made once.
   */
  WorkingHoursCredential: {
    public: [
      'withinRBALimit',
      'withinRBAWeeklyLimit',
      'withinLocalMonthlyLimit',
      'weeklyHoursLimit',
      'overtimeVoluntary',
      'restDayCompliant',
      'standardVersion',
      'periodStart',
      'valueCommitment',
    ],
    hidden: ['totalHours', 'overtimeHours', 'commitmentSalt'],
  },
  /**
   * The worker's own account of their hours, signed by the worker alone.
   *
   * Every other credential here starts with an employer writing something
   * down. This one does not, which is the entire point: a factory that keeps
   * no record of an overtime shift cannot be caught by comparing its records
   * to the worker's, because both sides are empty. A self-report is weak
   * evidence on its own — see docs/self-reported-hours.md — but a whole
   * cohort's self-reports diverging from a factory's filings is a signal that
   * did not previously exist.
   */
  SelfReportedHoursCredential: {
    public: ['withinRBALimit', 'periodStart', 'periodEnd'],
    hidden: ['reportedHours'],
  },

  // Issued by a bank or remittance operator — a data source the factory cannot
  // control. Cross-checking it against working hours turns single-party lying
  // into a two-party conspiracy between institutions with opposing interests.
  SalaryDepositCredential: {
    public: ['periodStart', 'periodEnd', 'issuerType', 'valueCommitment'],
    hidden: ['depositedAmountTWD', 'depositCount', 'commitmentSalt'],
  },
  // The one credential that is about the wallet rather than about the work.
  // identityAnchor is public because uniqueness has to be checkable by anyone
  // enrolling a wallet; the salt that makes it un-reversible is not.
  ResidencyCredential: {
    public: ['identityAnchor', 'holderDid', 'deviceCredentialId', 'permitValidUntil'],
    hidden: ['anchorSalt', 'arcReference'],
  },
};

export function getCredentialSchema(type: CredentialType): DisclosureSchema {
  return SCHEMAS[type];
}
