/**
 * What to do about the facilities this project's method does not reach.
 *
 * `docs/k-anonymity.md` says, correctly, that below five workers the system
 * refuses and does not pretend to help. That sentence is honest and it is also
 * where the document used to stop — which quietly concedes that the method
 * fails at the tail of the supply chain, where a very large share of the
 * world's contract labour actually works. "We refuse" is an honest answer. It
 * is not the only honest answer.
 *
 * Two paths exist that answer something real without faking anonymity.
 *
 * **Pooling.** Small facilities in the same industry, region and period are one
 * population. A brand can learn the compliance rate of small garment factories
 * in a region; it cannot learn one factory's, and not because a check forbids
 * it — because the answer has no facility field to read.
 *
 * **Endorsement.** Below the floor, the honest substitute for a statistic is
 * not a smaller statistic, it is a different kind of evidence: an audit body
 * that went to the site and signed for what it saw. That is a judgement about
 * an employer, not a figure derived from worker credentials, so the
 * k-anonymity floor it routes around is not being evaded — it does not apply.
 *
 * Neither path is as good as the main one, and the module says which is which
 * rather than letting a reader assume parity.
 */

import type { ReasonCode } from '@eas/shared';
import type { AuditorDirectory } from './auditorDirectory.js';

/**
 * A facility too small to be answered about on its own, holding the same kind
 * of already-verified booleans as `CohortEvidence`. The facility name is here
 * so pooling can group and count; it is what never leaves.
 */
export interface SmallFacilityCohort {
  readonly facility: string;
  readonly industry: string;
  readonly region: string;
  readonly window: string;
  readonly conclusions: readonly boolean[];
}

/**
 * Three.
 *
 * Two facilities are not a pool. A participant who knows their own numbers —
 * and a factory always knows its own — subtracts them from a two-facility
 * aggregate and recovers the other's exactly. It is the argument that makes
 * k=2 useless for individuals, applied one level up.
 *
 * Three is a floor, not a guarantee: with three, knowing your own leaves an
 * aggregate over two. It is the point at which pooling starts to do anything at
 * all, and docs/k-anonymity.md states the residual risk rather than burying it.
 */
export const MIN_POOLED_FACILITIES = 3;

export interface PooledStratum {
  readonly conclusions: readonly boolean[];
  readonly facilities: readonly string[];
  /**
   * Opaque ids keyed by facility rather than by position in the pool.
   *
   * This is what lets the differencing guard see the attack that is specific to
   * pooling: a stratum that loses one facility between two questions differs by
   * exactly that facility's workers, and subtracting the two answers isolates
   * it. Positional ids would make the two pools look like the same population
   * shifted by a few slots, and the guard would wave them both through.
   */
  readonly recordIds: readonly string[];
}

/** Groups a stratum. Exact match on all three keys — see `poolSmallFacilities`. */
export function poolSmallFacilities(
  cohorts: readonly SmallFacilityCohort[],
  stratum: { readonly industry: string; readonly region: string; readonly window: string },
): PooledStratum {
  // Exact matching, not prefix or hierarchy. A caller who could ask for
  // "north" and then "north-district-5" would be subtracting one stratum from
  // another, and the narrower answer is the facility-level figure the whole
  // arrangement exists to withhold.
  const members = cohorts.filter(
    (c) =>
      c.industry === stratum.industry &&
      c.region === stratum.region &&
      c.window === stratum.window,
  );

  return {
    conclusions: members.flatMap((m) => [...m.conclusions]),
    facilities: members.map((m) => m.facility),
    recordIds: members.flatMap((m) => m.conclusions.map((_, i) => `${m.facility}#${i}`)),
  };
}

/**
 * A pooled compliance rate.
 *
 * There is no facility field on this type and there will not be one. The
 * guarantee is the shape of the answer, not a check somewhere that removes it.
 */
export type PooledRateAnswer =
  | {
      readonly ok: true;
      readonly industry: string;
      readonly region: string;
      readonly window: string;
      readonly pooledSize: number;
      readonly facilityCount: number;
      readonly rate: number;
      /**
       * Always false, as a literal type: no code path can produce a pooled rate
       * that claims to describe one facility. It is written into the answer so
       * a reader of an audit log a year from now cannot mistake it for one.
       */
      readonly attributableToFacility: false;
    }
  | { readonly ok: false; readonly reason: ReasonCode };

/**
 * A site visit, signed for by a body that can be resolved to the same GLEIF
 * root as everything else here.
 *
 * Note what it cannot carry: no headcount, no rate, no per-worker fact. An
 * endorsement that could carry a figure would be a statistic wearing an
 * auditor's badge, and routing around the k-anonymity floor would become
 * evading it.
 */
export interface FacilityEndorsement {
  readonly facility: string;
  readonly auditorDid: string;
  /** ISO date of the visit. */
  readonly visitedOn: string;
  readonly verdict: 'PASS' | 'FAIL' | 'CONDITIONAL';
  /** Which RBA items the visit covered, so a reader knows what it does not cover. */
  readonly scope: readonly string[];
}

/**
 * One year.
 *
 * A visit ages into uselessness, and the failure mode of letting it through
 * with a date attached is that the reader who was supposed to weigh the date
 * does not. Refusing puts the staleness where it cannot be skimmed past.
 */
export const ENDORSEMENT_VALID_DAYS = 365;

export type EndorsementAnswer =
  | {
      readonly ok: true;
      readonly facility: string;
      readonly auditor: { readonly legalName: string; readonly lei: string };
      readonly visitedOn: string;
      readonly verdict: FacilityEndorsement['verdict'];
      readonly scope: readonly string[];
      /** What kind of evidence this is. Never inferred, always stated. */
      readonly basis: 'ON_SITE_AUDIT';
      /**
       * True, always. This project's argument is that point-in-time audits are
       * weak; the fallback must not present itself as the continuous
       * verification it is standing in for.
       */
      readonly pointInTime: true;
    }
  | { readonly ok: false; readonly reason: ReasonCode };

const DAY_MS = 24 * 60 * 60 * 1000;

export function checkEndorsement(
  endorsement: FacilityEndorsement | undefined,
  auditors: AuditorDirectory | undefined,
  asOf: Date,
): EndorsementAnswer {
  if (endorsement === undefined) {
    return { ok: false, reason: 'ENDORSEMENT_MISSING' };
  }

  // A verifier that never configured a directory has verified nothing. Treating
  // the absent case as "no objection" is how fail-open gets written by accident.
  const standing = auditors?.standing(endorsement.auditorDid);
  if (standing === undefined) {
    return { ok: false, reason: 'AUDITOR_CHAIN_INVALID' };
  }

  const visited = Date.parse(endorsement.visitedOn);
  if (Number.isNaN(visited) || asOf.getTime() - visited > ENDORSEMENT_VALID_DAYS * DAY_MS) {
    return { ok: false, reason: 'ENDORSEMENT_EXPIRED' };
  }

  return {
    ok: true,
    facility: endorsement.facility,
    auditor: { legalName: standing.legalName, lei: standing.lei },
    visitedOn: endorsement.visitedOn,
    verdict: endorsement.verdict,
    scope: endorsement.scope,
    basis: 'ON_SITE_AUDIT',
    pointInTime: true,
  };
}
