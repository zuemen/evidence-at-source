/**
 * Unified audit trail — the six-point framework's "Audit Log" answer, and the
 * thing a brand hands over when an NGO asks what it actually checked.
 *
 * Every gate decision is recorded with its layer, verdict, reason code and
 * authorization basis (delegation credential hash + ECR credential SAID), so
 * "on whose authority did the agent act, and what did the gate decide" is a
 * queryable record rather than log-file archaeology. Entries carry reason
 * codes only — never a worker field value.
 *
 * A list of decisions is only evidence if it cannot be edited afterwards, and
 * the party who most wants to edit it is the one holding it. Two properties
 * make that hard rather than merely discouraged:
 *
 *   - **Each entry commits to the one before it.** Changing an old decision
 *     changes its digest, and every later entry's `prev` stops matching. A
 *     tampered trail fails verification at the first altered row.
 *   - **Each entry is signed.** Without the verifier's key you cannot forge a
 *     replacement row, so rewriting history requires the key, not just write
 *     access to the file.
 *
 * What a chain cannot do is prove nothing was *dropped from the end*: a holder
 * can always publish a shorter prefix. `verifyAuditTrail` therefore reports
 * the length it verified, and the receipts a verifier already handed out are
 * what makes a missing tail noticeable to the other side.
 */

import { credentialHash, type ReasonCode } from '@eas/shared';
import { SignJWT, jwtVerify, importJWK, type JWK } from 'jose';
import type { PrivateJwk, PublicJwk } from '@eas/shared';
import { isChainVerifiedKey, type IssuerSigningKey } from './vleiBridge.js';

export const AUDIT_ENTRY_TYP = 'audit-entry+jwt';

/** The digest an empty trail commits to, so entry 1 has a real predecessor. */
export const AUDIT_GENESIS = 'sha256:genesis';

export interface AuditBasis {
  readonly delegationHash: string | null;
  readonly ecrSaid: string | null;
}

export interface AuditEntry {
  readonly seq: number;
  readonly at: string;
  readonly agentRole: string;
  readonly layer: 'L0' | 'L1' | 'L2';
  readonly action: string;
  readonly decision: 'ALLOW' | 'DENY';
  readonly reason: ReasonCode | null;
  readonly basis: AuditBasis;
  /** Digest of the previous entry's signed form. Genesis for the first. */
  readonly prev: string;
}

export interface SealedAuditEntry {
  readonly entry: AuditEntry;
  /** The entry as a signed JWT. Null when the trail keeps no signing key. */
  readonly seal: string | null;
}

export interface AuditTrail {
  record(entry: Omit<AuditEntry, 'seq' | 'at' | 'prev'>): AuditEntry;
  entries(): readonly AuditEntry[];
  /** The trail in the form another party can check. */
  export(): Promise<readonly SealedAuditEntry[]>;
}

export interface AuditTrailOptions {
  /**
   * The verifier's own signing key.
   *
   * Optional, and its absence is visible rather than silent: an unsealed trail
   * exports entries with `seal: null`, and verification says so. A trail that
   * cannot be signed should look weaker than one that can, not identical.
   */
  readonly signingKey?: PrivateJwk;
  readonly verifierDid?: string;
}

export type AuditVerifierKey = IssuerSigningKey;

/**
 * Digest over the entry's content, in a fixed field order.
 *
 * Hand-built rather than JSON.stringify of the whole object: key order in an
 * object literal is not a stable part of the format, and a chain whose digests
 * depend on it would break the day someone reorders a field.
 */
function digestOf(entry: AuditEntry): string {
  return credentialHash(
    [
      entry.seq,
      entry.at,
      entry.agentRole,
      entry.layer,
      entry.action,
      entry.decision,
      entry.reason ?? '',
      entry.basis.delegationHash ?? '',
      entry.basis.ecrSaid ?? '',
      entry.prev,
    ].join('|'),
  );
}

export function createAuditTrail(options: AuditTrailOptions = {}): AuditTrail {
  const log: AuditEntry[] = [];

  return {
    record(entry) {
      const previous = log[log.length - 1];
      const full: AuditEntry = {
        ...entry,
        seq: log.length + 1,
        at: new Date().toISOString(),
        prev: previous === undefined ? AUDIT_GENESIS : digestOf(previous),
      };
      log.push(full);

      return full;
    },

    entries: () => log,

    async export() {
      const { signingKey, verifierDid } = options;
      if (signingKey === undefined) return log.map((entry) => ({ entry, seal: null }));

      const key = await importJWK(signingKey as JWK, 'ES256');

      return Promise.all(
        log.map(async (entry) => ({
          entry,
          seal: await new SignJWT({ digest: digestOf(entry), seq: entry.seq })
            .setProtectedHeader({ alg: 'ES256', typ: AUDIT_ENTRY_TYP })
            .setIssuer(verifierDid ?? 'did:web:verifier.example')
            .sign(key),
        })),
      );
    },
  };
}

export type AuditVerification =
  | { readonly ok: true; readonly verifiedEntries: number; readonly sealed: boolean }
  | { readonly ok: false; readonly reason: AuditFailure; readonly atSeq: number };

export type AuditFailure =
  | 'CHAIN_BROKEN'
  | 'SEQUENCE_BROKEN'
  | 'SEAL_INVALID'
  | 'KEY_NOT_CHAIN_VERIFIED';

/**
 * Re-derives the chain and checks every seal.
 *
 * Written so that a challenger — an NGO, a regulator, the other side of a
 * dispute — can run it against an exported trail without any of this system's
 * state. That is the only version of "audit log" that is worth anything: one
 * the holder cannot be the sole judge of.
 */
export async function verifyAuditTrail(
  exported: readonly SealedAuditEntry[],
  verifierPublicKey?: PublicJwk,
): Promise<AuditVerification> {
  // Layer 1 refuses any signing key that did not arrive through a verified
  // Legal Entity chain, and an audit trail is the one place that rule used to
  // have an exception: a key handed in by the party being audited. Where the
  // caller supplies a chain-verified key the provenance is checked here too,
  // so "this record was sealed by that bank" is a claim about the chain rather
  // than about whoever passed the argument.
  if (verifierPublicKey !== undefined && !isChainVerifiedKey(verifierPublicKey)) {
    return { ok: false, reason: 'KEY_NOT_CHAIN_VERIFIED', atSeq: 0 };
  }

  let expectedPrev = AUDIT_GENESIS;
  let sealed = true;

  for (const [index, sealedEntry] of exported.entries()) {
    const { entry, seal } = sealedEntry;

    if (entry.seq !== index + 1) {
      return { ok: false, reason: 'SEQUENCE_BROKEN', atSeq: entry.seq };
    }
    if (entry.prev !== expectedPrev) {
      return { ok: false, reason: 'CHAIN_BROKEN', atSeq: entry.seq };
    }

    if (seal === null) {
      sealed = false;
    } else if (verifierPublicKey !== undefined) {
      try {
        const key = await importJWK(verifierPublicKey as JWK, 'ES256');
        const { payload } = await jwtVerify(seal, key);
        if (payload['digest'] !== digestOf(entry)) {
          return { ok: false, reason: 'SEAL_INVALID', atSeq: entry.seq };
        }
      } catch {
        return { ok: false, reason: 'SEAL_INVALID', atSeq: entry.seq };
      }
    }

    expectedPrev = digestOf(entry);
  }

  return { ok: true, verifiedEntries: exported.length, sealed };
}
