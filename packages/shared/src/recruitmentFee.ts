/**
 * Whether a recruitment-fee record satisfies RBA Employer Pays.
 *
 * The rule has two limbs and the second is easy to drop: fees the worker paid
 * must be reimbursed, and reimbursed **within 90 days of employment starting**.
 * A verifier that only read `zeroRecruitmentFeePaid` would decline a worker
 * whose employer did exactly what the standard requires — which would punish
 * the compliant case and teach employers nothing.
 *
 * Taiwan's statutory service-fee ceiling is a separate limb entirely and is
 * deliberately not part of this function. A factory inside that ceiling can be
 * in plain breach of Employer Pays, and conflating them is the mistake this
 * module exists to make impossible.
 */

export interface RecruitmentFeeFacts {
  readonly zeroRecruitmentFeePaid?: boolean;
  readonly feesReimbursedByEmployer?: boolean;
  readonly reimbursedWithin90Days?: boolean;
}

/**
 * Undefined inputs are treated as not established, never as satisfied — the
 * same fail-closed rule the rest of the gate follows.
 */
export function meetsEmployerPays(facts: RecruitmentFeeFacts): boolean {
  if (facts.zeroRecruitmentFeePaid === true) return true;

  return facts.feesReimbursedByEmployer === true && facts.reimbursedWithin90Days === true;
}
