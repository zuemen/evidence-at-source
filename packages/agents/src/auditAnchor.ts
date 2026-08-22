/**
 * Checkpoints — the answer to the one thing a hash chain cannot do.
 *
 * `verifyAuditTrail` proves that nothing in the middle of a trail was altered
 * or removed, and says so honestly: a holder can still publish a shorter
 * prefix and it verifies perfectly. Every entry is intact; the ones that
 * embarrass them are simply not there. Nothing inside the trail can detect
 * that, because a truncated chain is a valid chain.
 *
 * The fix has to come from outside the holder's control. Periodically the
 * trail's head is published somewhere the holder cannot rewrite — a
 * counterparty's receipt, a regulator's inbox, a transaction on a public
 * chain — and that published value says: at this moment, this trail was at
 * least this long, and its head was this. A trail handed over later that is
 * shorter than a checkpoint, or that disagrees with one at the same position,
 * is not merely unverified. It is contradicted.
 *
 * What this module does and does not claim:
 *
 *   - It **does** make truncation past a checkpoint detectable by anyone
 *     holding the checkpoint.
 *   - It does **not** protect the window since the last checkpoint. Entries
 *     recorded after it can still be dropped, so checkpoint frequency is the
 *     size of the hole, and `checkpointGap` reports it rather than hiding it.
 *   - It does **not** make the checkpoint itself trustworthy. A checkpoint
 *     kept by the same party that keeps the trail proves nothing at all: they
 *     can drop both. `AnchorPublisher` exists so the publishing side is a
 *     seam the deployment fills with something external — and
 *     `createLocalAnchorLog` is labelled as what it is, a demo stand-in that
 *     provides no independence whatsoever.
 *
 * No key material and no chain client live here. Publishing to a public chain
 * is an adapter written outside this repository, because an anchoring key in
 * a repo is a key in a repo.
 */

import { entryDigest, type SealedAuditEntry } from './auditTrail.js';

export interface AuditCheckpoint {
  /** How many entries the trail held when this was published. */
  readonly seq: number;
  /** The digest of entry `seq` — the head of the chain at that moment. */
  readonly headDigest: string;
  readonly at: string;
}

export interface AnchorReceipt {
  readonly checkpoint: AuditCheckpoint;
  /**
   * Where the checkpoint can be read back from, in whatever form the publisher
   * uses — a transaction hash, a URL, a receipt id.
   *
   * Opaque on purpose: what makes a checkpoint worth anything is that it is
   * outside the holder's reach, and this module cannot verify that property
   * for any given locator. The deployment is what makes the claim true; this
   * is only the handle.
   */
  readonly locator: string;
}

export interface AnchorPublisher {
  publish(checkpoint: AuditCheckpoint): Promise<AnchorReceipt>;
}

/**
 * Derives the checkpoint for a trail as it stands.
 *
 * Returns null for an empty trail: "this trail was at least zero entries long"
 * is not a statement anyone can be held to.
 */
export function checkpointFor(exported: readonly SealedAuditEntry[]): AuditCheckpoint | null {
  const head = exported[exported.length - 1];
  if (head === undefined) return null;

  return {
    seq: head.entry.seq,
    headDigest: entryDigest(head.entry),
    at: new Date().toISOString(),
  };
}

export type AnchorFailure =
  /** The trail is shorter than a checkpoint says it once was. */
  | 'TAIL_TRUNCATED'
  /** The trail's entry at the checkpoint's position is not the one anchored. */
  | 'ANCHOR_MISMATCH';

export type AnchorVerification =
  | {
      readonly ok: true;
      /**
       * Entries recorded after the newest checkpoint.
       *
       * The unprotected window, reported rather than glossed over: a reader
       * who needs the tail covered needs to know how much of it is not.
       */
      readonly checkpointGap: number;
      readonly checkpointsChecked: number;
    }
  | { readonly ok: false; readonly reason: AnchorFailure; readonly atSeq: number };

/**
 * Checks an exported trail against checkpoints published while it was growing.
 *
 * Deliberately separate from `verifyAuditTrail`: that function answers "is
 * this trail internally consistent", which a challenger can ask with the trail
 * alone. This one answers "is this the same trail we saw before", which
 * requires something the holder did not supply. Keeping them apart keeps the
 * second question from quietly looking answered when nobody brought a
 * checkpoint.
 */
export function verifyAgainstCheckpoints(
  exported: readonly SealedAuditEntry[],
  checkpoints: readonly AuditCheckpoint[],
): AnchorVerification {
  let highest = 0;

  for (const checkpoint of checkpoints) {
    const atPosition = exported[checkpoint.seq - 1];

    if (atPosition === undefined) {
      return { ok: false, reason: 'TAIL_TRUNCATED', atSeq: checkpoint.seq };
    }
    if (entryDigest(atPosition.entry) !== checkpoint.headDigest) {
      return { ok: false, reason: 'ANCHOR_MISMATCH', atSeq: checkpoint.seq };
    }

    highest = Math.max(highest, checkpoint.seq);
  }

  return {
    ok: true,
    checkpointGap: exported.length - highest,
    checkpointsChecked: checkpoints.length,
  };
}

/**
 * An in-process publisher for the demo, and no more than that.
 *
 * It provides none of the independence the mechanism relies on — the same
 * process holds the trail and the checkpoints, so a party willing to truncate
 * one would truncate the other. It exists so the demo can show the detection
 * working, and it is named `Local` so nobody mistakes it for the real thing.
 */
export function createLocalAnchorLog(): AnchorPublisher & {
  checkpoints(): readonly AuditCheckpoint[];
} {
  const published: AuditCheckpoint[] = [];

  return {
    async publish(checkpoint) {
      published.push(checkpoint);

      return {
        checkpoint,
        locator: `local:${checkpoint.seq}:${checkpoint.headDigest.slice(0, 16)}`,
      };
    },
    checkpoints: () => published,
  };
}
