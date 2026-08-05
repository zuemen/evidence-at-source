/**
 * DelegationCredential — an agent's own authorization, issued by the institution
 * it acts for. This is the answer to "on whose authority?": the Policy Gate can
 * check who an agent is, who empowered it, how far, and until when.
 *
 * The query types an agent may be granted are boolean or aggregate — never
 * individual. That exclusion is a compile-time fact, not a runtime check: there
 * is no way to place an individual-query authorization into `allowedQueryTypes`,
 * mirroring how `BankAssessment.requiresHumanReview` is typed as literal `true`.
 */

import type { IssuerTier } from './issuerTier.js';

export type AllowedQueryType = 'boolean' | 'aggregate';

export const DELEGATION_VCT = 'DelegationCredential';

/** One day. An agent's authority should not outlive the task it was granted for. */
export const DEFAULT_DELEGATION_LIFETIME_SECONDS = 24 * 60 * 60;

export interface DelegationClaims {
  /** Institution DID that granted this authority, e.g. did:web:bank.example. */
  readonly principal: string;
  /** Display name of the institution, for the worker's wallet to show. */
  readonly principalName: string;
  /** The agent identity this authority is granted to. */
  readonly agentDid: string;
  /** Query classes the agent may make. Cannot, by type, include individual. */
  readonly allowedQueryTypes: readonly AllowedQueryType[];
  /** Credential types the agent may ask about. */
  readonly scope: readonly string[];
  /** Human-readable purpose, for the worker to judge. */
  readonly purpose: string;
  /** Optional: the minimum issuer tier this agent's principal will accept (題06 Q1). */
  readonly minimumIssuerTier?: IssuerTier;
  readonly iat: number;
  readonly exp: number;
}
