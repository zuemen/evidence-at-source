/**
 * M-of-N social key recovery.
 *
 * Everything in this project hangs off one key. Without it a worker cannot
 * counter-sign anything, and every credential in their wallet becomes something
 * they can see and cannot use. This is a population whose phones are confiscated,
 * broken, left behind in a dormitory move, or taken before a deportation — so
 * "what happens when the key is gone" is not an edge case here, it is a
 * recurring event, and without an answer the whole argument collapses the first
 * time it happens.
 *
 * It is also the most dangerous thing in this repository, for a reason that
 * cannot be engineered away: **a mechanism that lets someone recover an identity
 * is a mechanism that lets someone take one.** The design below narrows who can
 * do it and how fast. It does not close it, and `recovery.test.ts` contains a
 * passing test in which colluding guardians succeed — the limit is recorded as
 * a fact rather than a caveat.
 *
 * Four things carry the weight:
 *
 *   - **A threshold of at least two.** One guardian is not recovery, it is a
 *     spare key held by somebody else.
 *   - **Approvals bind to one proposal.** A guardian signs over the specific
 *     replacement key, so an approval given once cannot be replayed to hand the
 *     identity to a different key later.
 *   - **An epoch.** Changing the guardian list retires every approval collected
 *     under the old one.
 *   - **A delay the current key can veto.** The only mechanism here that acts
 *     against takeover rather than for recovery — and it works only for a worker
 *     who still holds their key, which is precisely not the case in a real loss.
 *
 * Guardian keys are ed25519, matching the KEL layer, and the verification is
 * synchronous and dependency-light so it runs unchanged in a browser wallet.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import type { ReasonCode } from './reasonCodes.js';

export interface Guardian {
  readonly did: string;
  /** ed25519 verification key, hex. */
  readonly publicKey: string;
}

export interface RecoveryPolicy {
  readonly workerDid: string;
  readonly guardians: readonly Guardian[];
  /** How many guardians must agree. Never below MIN_RECOVERY_THRESHOLD. */
  readonly threshold: number;
  /** Bumped whenever the worker changes guardians. Retires old approvals. */
  readonly epoch: number;
  /** Hours between a complete proposal and it taking effect. */
  readonly delayHours: number;
}

export interface RecoveryProposal {
  readonly workerDid: string;
  /** The key that would take over. Signed into every approval. */
  readonly newPublicKey: string;
  readonly epoch: number;
  /** ISO 8601. The delay window runs from here. */
  readonly proposedAt: string;
  readonly nonce: string;
}

export interface RecoveryApproval {
  readonly guardianDid: string;
  readonly signature: string;
}

/**
 * Two.
 *
 * A threshold of one means any single guardian can take the identity whenever
 * they choose, which is strictly worse than the worker holding the key alone —
 * it adds a second person who can lose it and a second person who can be
 * pressured, and removes nothing.
 */
export const MIN_RECOVERY_THRESHOLD = 2;

export interface GuardianKey {
  readonly secret: Uint8Array;
  readonly publicKey: string;
}

export function createGuardianKey(): GuardianKey {
  const secret = ed25519.utils.randomPrivateKey();

  return { secret, publicKey: bytesToHex(ed25519.getPublicKey(secret)) };
}

/**
 * What a guardian actually signs.
 *
 * Every field of the proposal is in here, which is what stops an approval from
 * being reusable: change the replacement key, the worker, the epoch or the
 * nonce, and the signature no longer verifies against the digest.
 */
export function proposalDigest(proposal: RecoveryProposal): string {
  const canonical = [
    proposal.workerDid,
    proposal.newPublicKey,
    String(proposal.epoch),
    proposal.proposedAt,
    proposal.nonce,
  ].join('\n');

  return bytesToHex(sha256(utf8ToBytes(canonical)));
}

export function approveRecovery(
  secret: Uint8Array,
  guardianDid: string,
  proposal: RecoveryProposal,
): RecoveryApproval {
  const digest = hexToBytes(proposalDigest(proposal));

  return { guardianDid, signature: bytesToHex(ed25519.sign(digest, secret)) };
}

export interface VerifyRecoveryInput {
  readonly policy: RecoveryPolicy;
  readonly proposal: RecoveryProposal;
  readonly approvals: readonly RecoveryApproval[];
  /** The current key objected during the window. */
  readonly vetoed?: boolean;
  readonly asOf: Date;
}

export type RecoveryResult =
  | { readonly ok: true; readonly newPublicKey: string; readonly approvals: number }
  | { readonly ok: false; readonly reason: ReasonCode };

function policyIsCoherent(policy: RecoveryPolicy, proposal: RecoveryProposal): boolean {
  if (policy.workerDid !== proposal.workerDid) return false;
  if (policy.threshold < MIN_RECOVERY_THRESHOLD) return false;
  if (policy.threshold > policy.guardians.length) return false;

  // A guardian listed twice would fill two slots with one person, which is the
  // threshold defeating itself quietly.
  const dids = new Set(policy.guardians.map((g) => g.did));
  const keys = new Set(policy.guardians.map((g) => g.publicKey));

  return dids.size === policy.guardians.length && keys.size === policy.guardians.length;
}

export function verifyRecovery(input: VerifyRecoveryInput): RecoveryResult {
  const { policy, proposal, approvals } = input;

  if (!policyIsCoherent(policy, proposal)) {
    return { ok: false, reason: 'RECOVERY_POLICY_INVALID' };
  }

  if (policy.epoch !== proposal.epoch) {
    return { ok: false, reason: 'RECOVERY_EPOCH_STALE' };
  }

  const digest = hexToBytes(proposalDigest(proposal));
  const counted = new Set<string>();

  for (const approval of approvals) {
    const guardian = policy.guardians.find((g) => g.did === approval.guardianDid);
    // An unknown DID, or a known DID signed with a key that is not theirs.
    if (guardian === undefined || counted.has(guardian.did)) continue;

    try {
      if (ed25519.verify(hexToBytes(approval.signature), digest, hexToBytes(guardian.publicKey))) {
        counted.add(guardian.did);
      }
    } catch {
      // A malformed signature simply does not count toward the threshold.
    }
  }

  if (counted.size < policy.threshold) {
    return { ok: false, reason: 'RECOVERY_THRESHOLD_NOT_MET' };
  }

  // Checked after the threshold: a veto is only meaningful against a proposal
  // that would otherwise succeed, and reporting it earlier would tell a caller
  // holding too few approvals that the worker is still watching.
  if (input.vetoed === true) {
    return { ok: false, reason: 'RECOVERY_VETOED' };
  }

  const effectiveFrom = Date.parse(proposal.proposedAt) + policy.delayHours * 60 * 60 * 1000;
  if (Number.isNaN(effectiveFrom) || input.asOf.getTime() < effectiveFrom) {
    return { ok: false, reason: 'RECOVERY_DELAY_NOT_ELAPSED' };
  }

  return { ok: true, newPublicKey: proposal.newPublicKey, approvals: counted.size };
}
