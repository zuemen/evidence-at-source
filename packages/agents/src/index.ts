export { K_ANONYMITY_THRESHOLD, checkQueryLayer } from './policyGate.js';
export type {
  AggregateMetric,
  CohortContext,
  Query,
  QueryDecision,
} from './policyGate.js';

export { checkCredentialLayer } from './credentialLayer.js';
export type {
  CredentialDecision,
  CredentialLayerInput,
  IdentityBindingCheck,
} from './credentialLayer.js';

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
  RbaItemAnswer,
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

export {
  createGroth16Verifier,
  stubProofVerifier,
  verifyReconciliationProof,
} from './zkReconciliation.js';
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

export { createAuditorDirectory } from './auditorDirectory.js';
export type { AuditorDirectory, AuditorEntry, AuditorStanding } from './auditorDirectory.js';

export {
  chainTierOf,
  isChainVerifiedKey,
  requireIssuerSigningKey,
  resolveAgentAuthority,
  resolveIssuerSigningKey,
} from './vleiBridge.js';
export type {
  AgentAuthority,
  AgentAuthorityResult,
  IssuerIdentity,
  IssuerIdentityResult,
  IssuerSigningKey,
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

export {
  DEFAULT_SHARED_DEVICE_THRESHOLD,
  createProxyingMonitor,
} from './proxyingMonitor.js';
export type { ProxyingMonitor, ProxyingRisk } from './proxyingMonitor.js';

export { RBA_ITEM_CLASSIFICATION, classifyRbaItem } from './rbaItems.js';
export type { RbaItemClass } from './rbaItems.js';

export { AUDIT_ENTRY_TYP, AUDIT_GENESIS, createAuditTrail, verifyAuditTrail } from './auditTrail.js';
export type {
  AuditBasis,
  AuditEntry,
  AuditFailure,
  AuditTrail,
  AuditTrailOptions,
  AuditVerification,
  SealedAuditEntry,
} from './auditTrail.js';
