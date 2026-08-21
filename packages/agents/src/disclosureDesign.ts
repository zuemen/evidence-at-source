/**
 * Disclosure Design — what each seat receives, and what it structurally cannot.
 *
 * The MLMTEK workshop suggested presenting work along four axes, one of which
 * is disclosure design: for every party that sees anything, state precisely
 * what reaches them. This project already had two such parties; it had simply
 * never said so in those terms.
 *
 * Everything here is **derived**, never written down twice. The withheld list
 * comes from the same `hidden` arrays the issuer uses to build the SD-JWT `_sd`
 * digests, so the table cannot claim a field is protected unless the credential
 * schema actually hides it. A hand-written table would be a claim about the
 * system; this is a reading of it.
 *
 * The two seats differ in kind, not just in scope:
 *
 *   - **The bank** asks about one person, with that person present, and gets
 *     booleans about them. Identity is the point of the query.
 *   - **The brand** asks about a population and gets one number. Nothing
 *     per-worker reaches it at all — not even the public booleans, because the
 *     conclusions are collapsed into a rate before the agent sees them. That is
 *     why the brand's withheld list is the wider of the two despite its
 *     credential carrying fewer hidden fields.
 */

import {
  getCredentialSchema,
  type CredentialType,
} from '@eas/shared';

export type Seat = 'BANK_AGENT_A' | 'BRAND_AGENT_B';

export interface SeatDisclosure {
  readonly seat: Seat;
  readonly label: string;
  /** Credential types this seat's mandate covers. */
  readonly scope: readonly CredentialType[];
  /** What actually reaches it. */
  readonly receives: readonly string[];
  /** What it cannot obtain, and why that is not merely a policy. */
  readonly withheld: readonly string[];
  readonly guarantee: string;
}

/**
 * The mandates the two seats hold. `delegationScopeMatches` lets a caller —
 * and a test — check that a live DelegationCredential agrees with this, so the
 * published table cannot drift away from the authority actually granted.
 */
export const SEAT_SCOPE: Readonly<Record<Seat, readonly CredentialType[]>> = {
  BANK_AGENT_A: [
    'RecruitmentFeeCredential',
    'DocumentCustodyCredential',
    'ContractConsentCredential',
  ],
  BRAND_AGENT_B: ['WorkingHoursCredential'],
};

/** Fields the bank's assessment carries, beyond the disclosed booleans. */
const BANK_ASSESSMENT_FIELDS = [
  'recommendation',
  'reasons',
  'requiresHumanReview',
  'riskFlags',
] as const;

/** Fields a brand aggregate carries. Note the absence of anything per-worker. */
const BRAND_AGGREGATE_FIELDS = [
  'disclosure',
  'metric',
  'cohort',
  'cohortSize',
  'rate',
  'compliant',
  'thresholds',
] as const;

const hiddenIn = (scope: readonly CredentialType[]): string[] =>
  scope.flatMap((type) => [...getCredentialSchema(type).hidden]);

const publicIn = (scope: readonly CredentialType[]): string[] =>
  scope.flatMap((type) => [...getCredentialSchema(type).public]);

export function disclosureDesign(): readonly SeatDisclosure[] {
  const bankScope = SEAT_SCOPE.BANK_AGENT_A;
  const brandScope = SEAT_SCOPE.BRAND_AGENT_B;

  return [
    {
      seat: 'BANK_AGENT_A',
      label: '銀行 Agent A',
      scope: bankScope,
      // Booleans about one person, plus the shape of the recommendation.
      receives: [...publicIn(bankScope), ...BANK_ASSESSMENT_FIELDS],
      withheld: hiddenIn(bankScope),
      guarantee:
        '隱藏欄位在 SD-JWT 的 `_sd` 摘要裡，驗證後的 payload 密碼學上不含這些 key——不是被遮蔽，是不存在。',
    },
    {
      seat: 'BRAND_AGENT_B',
      label: '品牌 Agent B',
      scope: brandScope,
      receives: [...BRAND_AGGREGATE_FIELDS],
      // Everything per-worker, including the public conclusions: the cohort is
      // collapsed to a list of booleans with no identifiers before the agent
      // exists, so there is no per-worker record for it to read badly.
      withheld: [...hiddenIn(brandScope), ...publicIn(brandScope), 'workerDID'],
      guarantee:
        '匯總前身分就已經消失（`buildCohortEvidence` 交出的是一串沒有識別資訊的布林值），且每個匯總都要通過 k-匿名與差分守門。',
    },
  ];
}

/** True when a live delegation's scope is exactly what the table publishes. */
export function delegationScopeMatches(seat: Seat, scope: readonly string[]): boolean {
  const expected = [...SEAT_SCOPE[seat]].sort();
  const actual = [...scope].sort();

  return expected.length === actual.length && expected.every((type, at) => type === actual[at]);
}
