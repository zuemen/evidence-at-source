export { K_ANONYMITY_THRESHOLD, checkQueryLayer } from './policyGate.js';
export type {
  AggregateMetric,
  CohortContext,
  Query,
  QueryDecision,
} from './policyGate.js';

export { checkCredentialLayer } from './credentialLayer.js';
export type { CredentialDecision, CredentialLayerInput } from './credentialLayer.js';

export { createBrandAgent } from './brandAgent.js';
export type {
  BrandAgent,
  BrandAnswer,
  CohortEvidence,
  PayrollConsistencyAnswer,
  PayrollRateAnswer,
  ReconciliationCohort,
} from './brandAgent.js';

export { buildCohortEvidence } from './cohort.js';
export type { CohortRequest, CohortResult, Submission } from './cohort.js';

export { createBankAgent } from './bankAgent.js';
export type {
  BankAgent,
  BankAssessment,
  DisclosedFacts,
  Recommendation,
} from './bankAgent.js';
