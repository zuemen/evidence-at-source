/**
 * Every rejection in the system resolves to one of these codes. They are
 * self-describing on purpose: a reader should never need a lookup table, and
 * a rejection must never carry the hidden value that caused it.
 */

export const REASON_CODES = [
  // L0 — agent-authorization layer. Checked before any worker data is read.
  'AGENT_DELEGATION_MISSING',
  'AGENT_DELEGATION_INVALID',
  'AGENT_DELEGATION_EXPIRED',
  'AGENT_DELEGATION_REVOKED',
  'QUERY_TYPE_NOT_IN_SCOPE',
  'CREDENTIAL_TYPE_NOT_IN_SCOPE',
  // L1 — credential layer
  'INVALID_ISSUER_SIGNATURE',
  'MISSING_WORKER_ATTESTATION',
  'ATTESTATION_HASH_MISMATCH',
  'CREDENTIAL_REVOKED',
  'CREDENTIAL_EXPIRED',
  'CLAIM_NOT_DISCLOSED',
  // A required fact was disclosed and did not satisfy policy. Distinct from
  // CLAIM_NOT_DISCLOSED so a human reviewer can tell "missing" from "failing".
  'POLICY_CHECK_FAILED',
  // L2 — query layer
  'INDIVIDUAL_QUERY_REJECTED',
  'AGGREGATE_BELOW_K_ANONYMITY',
  // Two answered aggregates whose populations differ by fewer than k can be
  // subtracted to isolate an individual. The later query is refused.
  'DIFFERENCING_ATTACK_DETECTED',
  // An agent has spent its per-period allowance of answered queries.
  'QUERY_BUDGET_EXCEEDED',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
