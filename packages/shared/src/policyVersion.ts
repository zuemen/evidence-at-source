/**
 * Every number the gate decides by, in one versioned place.
 *
 * GLEIF's definition of an audit record is evidence refs + **policy version** +
 * deployment version + decision + grant + execution receipt. The policy version
 * is the part this project had no way to supply, and its absence has a concrete
 * consequence: a receipt saying a cohort was refused for being under the bar is
 * unreadable a year later if nobody can say where the bar was that day. "83%
 * compliant" means something different under a k of 20 than under a k of 5, and
 * a reader holding only the number cannot tell which they have.
 *
 * So the thresholds are gathered here and stamped with a version, and every
 * audit entry and receipt carries the version it was decided under. Changing a
 * threshold means minting a new version rather than editing the current one —
 * `POLICY_HISTORY` keeps the old parameter sets so an old receipt still resolves
 * to the numbers that were in force when it was written.
 */

import { K_ANONYMITY, type KAnonymityThresholds } from './kAnonymity.js';

export interface PolicyParameters {
  readonly version: string;
  /** When this version came into force. ISO 8601 date. */
  readonly effectiveFrom: string;
  readonly kAnonymity: KAnonymityThresholds;
  /** Answered queries an agent may make per period. */
  readonly queryBudget: number;
  /** Payroll reconciliation tolerance, in basis points. */
  readonly reconciliationToleranceBps: number;
  /** Seconds a query id is remembered for replay detection. */
  readonly replayWindowSeconds: number;
  /** Hours a recovery proposal waits before it can take effect. */
  readonly recoveryDelayHours: number;
}

/**
 * The current policy. Bump the version when any number below changes, and add
 * the old one to POLICY_HISTORY rather than replacing it.
 */
export const POLICY_VERSION = '2026.08.1';

const CURRENT: PolicyParameters = {
  version: POLICY_VERSION,
  effectiveFrom: '2026-08-01',
  kAnonymity: K_ANONYMITY,
  queryBudget: 20,
  reconciliationToleranceBps: 200,
  replayWindowSeconds: 24 * 60 * 60,
  recoveryDelayHours: 72,
};

/**
 * Every policy version this deployment can still resolve.
 *
 * A receipt outlives the policy it was issued under, so the history is what
 * keeps an old one meaningful. Dropping a version here silently turns every
 * receipt that cites it into an unreadable number.
 */
export const POLICY_HISTORY: Readonly<Record<string, PolicyParameters>> = {
  [POLICY_VERSION]: CURRENT,
};

export function currentPolicy(): PolicyParameters {
  return CURRENT;
}

/** Undefined means this deployment cannot say what that version's numbers were. */
export function policyAt(version: string): PolicyParameters | undefined {
  return POLICY_HISTORY[version];
}
