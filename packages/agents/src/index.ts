export { K_ANONYMITY_THRESHOLD, checkQueryLayer } from './policyGate.js';
export type {
  AggregateMetric,
  CohortContext,
  Query,
  QueryDecision,
} from './policyGate.js';

export { checkCredentialLayer } from './credentialLayer.js';
export type { CredentialDecision, CredentialLayerInput } from './credentialLayer.js';

export {
  checkAgentDelegation,
  runAuthorizedGate,
  verifyDelegationValidity,
} from './delegationGate.js';
export type {
  AuthorizedGateResult,
  DelegationContext,
  DelegationDecision,
  DelegationValidityInput,
} from './delegationGate.js';

export {
  DEFAULT_K_ANONYMITY,
  DEFAULT_QUERY_BUDGET,
  createQuerySession,
} from './differencing.js';
export type {
  AuditedQuery,
  QuerySession,
  QuerySessionOptions,
  QueryVerdict,
} from './differencing.js';

export { createBrandAgent } from './brandAgent.js';
export type {
  BrandAgent,
  BrandAnswer,
  CohortEvidence,
  CommitmentCoverageAnswer,
  EvidenceIntegrityAnswer,
  OmissionCohort,
  OmissionCountAnswer,
  PayrollConsistencyAnswer,
  PayrollRateAnswer,
  ReconciliationCohort,
} from './brandAgent.js';

export { buildOmissionCohort } from './omission.js';
export type { HeldRecord, OmissionCohortRequest } from './omission.js';

export { computeEvidenceIntegrityIndex } from './evidenceIntegrity.js';
export type {
  EvidenceIntegrityResult,
  IntegrityComponents,
  IntegrityGrade,
} from './evidenceIntegrity.js';

export { stubProofVerifier, verifyReconciliationProof } from './zkReconciliation.js';
export type {
  BoundCredential,
  ProofVerifier,
  ReconciliationProofPublicSignals,
  ReconciliationProofResult,
  VerifyReconciliationProofInput,
} from './zkReconciliation.js';

export { buildCohortEvidence } from './cohort.js';
export type { CohortRequest, CohortResult, Submission } from './cohort.js';

export { createBankAgent } from './bankAgent.js';
export type {
  BankAgent,
  BankAssessment,
  DisclosedFacts,
  Recommendation,
} from './bankAgent.js';

export {
  resolveAgentAuthority,
  resolveIssuerSigningKey,
} from './vleiBridge.js';
export type {
  AgentAuthority,
  AgentAuthorityResult,
  IssuerIdentity,
  IssuerIdentityResult,
} from './vleiBridge.js';

export {
  RECEIPT_TYP,
  createVerificationLog,
  issueVerificationReceipt,
  verifyReceipt,
} from './receipt.js';
export type {
  RevocationNotice,
  VerificationLog,
  VerificationReceipt,
  VerificationResult,
} from './receipt.js';

export {
  DEFAULT_APPLICATION_THRESHOLD,
  createApplicationMonitor,
} from './applicationMonitor.js';
export type { ApplicationMonitor, ApplicationRisk } from './applicationMonitor.js';

export { RBA_ITEM_CLASSIFICATION, classifyRbaItem } from './rbaItems.js';
export type { RbaItemClass } from './rbaItems.js';
