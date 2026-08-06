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
] as const;

export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export interface DisclosureSchema {
  /** Claims always visible to a verifier. Conclusions only, never raw values. */
  readonly public: readonly string[];
  /** Claims placed in `_sd`, disclosed only when the worker chooses to. */
  readonly hidden: readonly string[];
}

const SCHEMAS: Record<CredentialType, DisclosureSchema> = {
  RecruitmentFeeCredential: {
    public: ['feeWithinLegalCap', 'currency', 'contractPeriod'],
    hidden: ['feeAmount', 'paymentSchedule', 'lenderName'],
  },
  DocumentCustodyCredential: {
    public: ['passportHeldByWorker', 'custodyConsentGiven', 'documentType'],
    hidden: ['documentHash', 'custodyLocation'],
  },
  ContractConsentCredential: {
    public: ['nativeLanguageVersionProvided', 'language', 'consentTimestamp'],
    hidden: ['salaryAmount', 'contractDocumentHash'],
  },
  // valueCommitment is public because the verifier needs it as a public input
  // to the reconciliation proof; commitmentSalt is hidden because disclosing it
  // would let anyone brute force the small range of plausible hour counts.
  WorkingHoursCredential: {
    public: ['withinRBALimit', 'periodStart', 'valueCommitment'],
    hidden: ['totalHours', 'overtimeHours', 'commitmentSalt'],
  },
  // Issued by a bank or remittance operator — a data source the factory cannot
  // control. Cross-checking it against working hours turns single-party lying
  // into a two-party conspiracy between institutions with opposing interests.
  SalaryDepositCredential: {
    public: ['periodStart', 'periodEnd', 'issuerType', 'valueCommitment'],
    hidden: ['depositedAmountTWD', 'depositCount', 'commitmentSalt'],
  },
};

export function getCredentialSchema(type: CredentialType): DisclosureSchema {
  return SCHEMAS[type];
}
