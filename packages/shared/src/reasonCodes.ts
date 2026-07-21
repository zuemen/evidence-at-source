/**
 * Every rejection in the system resolves to one of these codes. They are
 * self-describing on purpose: a reader should never need a lookup table, and
 * a rejection must never carry the hidden value that caused it.
 */

export const REASON_CODES = [
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
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
