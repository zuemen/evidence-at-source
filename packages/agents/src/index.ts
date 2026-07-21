export { K_ANONYMITY_THRESHOLD, checkQueryLayer } from './policyGate.js';
export type {
  AggregateMetric,
  CohortContext,
  Query,
  QueryDecision,
} from './policyGate.js';

export { createBrandAgent } from './brandAgent.js';
export type { BrandAgent, BrandAnswer, CohortEvidence } from './brandAgent.js';

export { createBankAgent } from './bankAgent.js';
export type {
  BankAgent,
  BankAssessment,
  DisclosedFacts,
  Recommendation,
} from './bankAgent.js';
