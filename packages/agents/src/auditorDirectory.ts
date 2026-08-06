/**
 * Third-party audit bodies, resolved rather than named — 題06 Q1.
 *
 * A T2 credential says "verified by SGS". Until now that was an unverified
 * string in the payload: naming a real audit body and naming an invented one
 * were indistinguishable to the gate, so "third-party verified" rested on the
 * same issuer honesty that the tier ladder used to rest on.
 *
 * An audit body is a Legal Entity like any other, holding an ECR credential
 * for the auditor role. Resolving `verifiedBy` therefore means walking the
 * same chain the rest of the system walks, up to the same GLEIF root.
 *
 * Nothing is cached, deliberately and for the same reason the chain itself is
 * re-walked on every query: a cached endorsement would keep a struck-off
 * auditor's signature meaningful for as long as the entry lived. When GLEIF
 * revokes the QVI, or the QVI revokes the audit body, every T2 credential it
 * backed stops resolving on the very next query.
 */

import { AUDITOR_ROLE, verifyEcrChain, type VleiPresentation, type VleiTrustContext } from '@eas/vlei';

export interface AuditorStanding {
  readonly did: string;
  readonly legalName: string;
  readonly lei: string;
}

export interface AuditorDirectory {
  /** Undefined means "cannot be shown to be an auditor", never "unknown but fine". */
  standing(did: string): AuditorStanding | undefined;
}

export interface AuditorEntry {
  /** The DID a T2 credential's `verifiedBy` would name. */
  readonly did: string;
  /** The body's ECR presentation, for the auditor role. */
  readonly presentation: VleiPresentation;
}

export function createAuditorDirectory(
  trust: VleiTrustContext,
  entries: readonly AuditorEntry[],
): AuditorDirectory {
  const byDid = new Map(entries.map((entry) => [entry.did, entry]));

  return {
    standing(did) {
      const entry = byDid.get(did);
      if (entry === undefined) return undefined;

      const verdict = verifyEcrChain(entry.presentation, trust, AUDITOR_ROLE);
      if (!verdict.ok) return undefined;

      return {
        did,
        legalName: verdict.facts.legalEntity.legalName,
        lei: verdict.facts.lei,
      };
    },
  };
}
