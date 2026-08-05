/**
 * Issuer trust tier — 題06 Q1.
 *
 * "Who may attest that a factory is compliant: the factory itself, a third-party
 * audit body, or a government authority — and should those carry the same
 * weight?" They should not. vLEI answers *who an issuer is*; this answers *how
 * much a claim from them is worth*. A verifier can see the tier and demand a
 * minimum, so "we only accept third-party-verified working hours" becomes a
 * machine-checkable policy rather than a procurement sentence.
 */

export const ISSUER_TIERS = [
  'SELF_DECLARED', // T1: factory / agency attesting about itself
  'THIRD_PARTY_VERIFIED', // T2: audit body or bank endorsement
  'AUTHORITY_CERTIFIED', // T3: government authority certification
] as const;

export type IssuerTier = (typeof ISSUER_TIERS)[number];

export function tierRank(tier: IssuerTier): number {
  return ISSUER_TIERS.indexOf(tier);
}

export function meetsMinimumTier(actual: IssuerTier, minimum: IssuerTier): boolean {
  return tierRank(actual) >= tierRank(minimum);
}
