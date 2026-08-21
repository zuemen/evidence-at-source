/**
 * Replay protection, at the query layer rather than on the credential.
 *
 * GLEIF's mandate credential carries `nonce: "single-use:92817"`, and copying
 * that field would be the wrong move here — which is worth stating, because
 * following a framework and using it correctly are different things.
 *
 * Their mandate authorises **one execution**: pay this invoice, once. A nonce
 * on the credential is exactly right for that, because the credential and the
 * action have the same lifetime.
 *
 * A DelegationCredential authorises **a period of asking** — twenty-four hours
 * of queries against a scope. Putting a single-use nonce on it would mean a
 * fresh delegation per question: a new issuance, a new signature, and a worker
 * asked to consider a new authorization every time a brand counted a cohort.
 * The protection would be real and the system would be unusable, which is its
 * own kind of insecurity.
 *
 * So the nonce moves to the thing that actually happens once: the query. Each
 * request carries a `jti`, the gate remembers the ones it has answered, and a
 * repeat is refused. The delegation stays a period-scoped grant, and replaying
 * a captured request still fails.
 *
 * The memory is bounded by the same period as the query budget. Remembering
 * forever would be a slow leak, and a window shorter than the delegation's life
 * would leave a gap where a captured request becomes replayable again.
 */

import { currentPolicy, type ReasonCode } from '@eas/shared';

export interface ReplayGuard {
  /**
   * Records a query id. `at` is injectable so tests need no clock.
   *
   * Returns a refusal on the second sighting — never on the first, and never a
   * partial result.
   */
  check(jti: string, at?: Date): { readonly ok: true } | { readonly ok: false; readonly reason: ReasonCode };
  /** How many ids are currently remembered. For the audit panel, not for policy. */
  size(at?: Date): number;
}

export interface ReplayGuardOptions {
  /** Defaults to the current policy's replay window. */
  readonly windowSeconds?: number;
}

export function createReplayGuard(options: ReplayGuardOptions = {}): ReplayGuard {
  const windowMs = (options.windowSeconds ?? currentPolicy().replayWindowSeconds) * 1000;

  /** jti -> first time seen. Ids only; no query content, no worker reference. */
  const seen = new Map<string, number>();

  function prune(now: number): void {
    for (const [jti, at] of seen) {
      // Dropped rather than kept and ignored: state not held cannot be handed
      // over later under a different justification.
      if (now - at > windowMs) seen.delete(jti);
    }
  }

  return {
    check(jti, at = new Date()) {
      const now = at.getTime();
      prune(now);

      if (seen.has(jti)) {
        return { ok: false, reason: 'QUERY_REPLAY_DETECTED' };
      }

      seen.set(jti, now);

      return { ok: true };
    },

    size(at = new Date()) {
      prune(at.getTime());

      return seen.size;
    },
  };
}
