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
  // L0 — vLEI trust chain. The agent's authority must trace through an ECR
  // credential to a Legal Entity vLEI and up to the GLEIF root.
  'AGENT_VLEI_MISSING',
  'AGENT_VLEI_CHAIN_INVALID',
  'AGENT_VLEI_REVOKED',
  'AGENT_VLEI_BINDING_MISMATCH',
  // L1 — issuer identity. A worker-credential issuer's signing key is only
  // trusted when it arrives inside a valid Legal Entity vLEI chain.
  'ISSUER_VLEI_CHAIN_INVALID',
  'ISSUER_VLEI_REVOKED',
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
  // ZK reconciliation binding (Phase 4). The proof itself is checked by an
  // injected verifier; these guard the binding between proof and credentials.
  'PROOF_INVALID',
  'PROOF_BINDING_MISMATCH',
  'PROOF_SUBJECT_MISMATCH',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
