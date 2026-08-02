/**
 * RecordSetCommitment — the anti-omission mechanism.
 *
 * Cross-validation (M7) catches numbers that disagree. This catches records that
 * were never declared at all. Each period the factory publishes a signed
 * commitment to the Merkle root of the record set it claims to have. A worker
 * holding a genuine, counter-signed credential can demand an inclusion proof; if
 * the factory cannot produce one, the record was omitted.
 */

import { SignJWT, jwtVerify, importJWK, type JWK } from 'jose';
import type { PrivateJwk, PublicJwk } from '@eas/shared';
import { buildMerkleTree, verifyInclusionProof, type InclusionProof, type MerkleTree } from './merkle.js';

export const COMMITMENT_TYP = 'record-set-commitment+jwt';

export interface CommitmentMeta {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly factoryDID: string;
}

export interface RecordSetCommitment {
  readonly merkleRoot: string;
  readonly recordCount: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly factoryDID: string;
}

export function createRecordSetCommitment(
  recordHashes: readonly string[],
  meta: CommitmentMeta,
): { commitment: RecordSetCommitment; tree: MerkleTree } {
  const tree = buildMerkleTree(recordHashes);

  return {
    tree,
    commitment: {
      merkleRoot: tree.root,
      recordCount: recordHashes.length,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      factoryDID: meta.factoryDID,
    },
  };
}

export async function signCommitment(
  factoryPrivateKey: PrivateJwk,
  commitment: RecordSetCommitment,
): Promise<string> {
  const key = await importJWK(factoryPrivateKey as JWK, 'ES256');

  return new SignJWT({ ...commitment })
    .setProtectedHeader({ alg: 'ES256', typ: COMMITMENT_TYP })
    .setIssuer(commitment.factoryDID)
    .sign(key);
}

export async function verifyCommitment(
  signedCommitment: string,
  factoryPublicKey: PublicJwk,
): Promise<RecordSetCommitment | null> {
  try {
    const key = await importJWK(factoryPublicKey as JWK, 'ES256');
    const { payload } = await jwtVerify(signedCommitment, key);

    return {
      merkleRoot: String(payload['merkleRoot']),
      recordCount: Number(payload['recordCount']),
      periodStart: String(payload['periodStart']),
      periodEnd: String(payload['periodEnd']),
      factoryDID: String(payload['factoryDID']),
    };
  } catch {
    return null;
  }
}

export interface OmissionInput {
  readonly heldRecordHash: string;
  readonly commitment: RecordSetCommitment;
  /** The inclusion proof the factory could produce, or null if it could not. */
  readonly inclusionProof: InclusionProof | null;
}

/** True when the held record cannot be proven to be part of the committed set. */
export function detectOmission(input: OmissionInput): boolean {
  if (input.inclusionProof === null) {
    return true;
  }

  const included = verifyInclusionProof(
    input.heldRecordHash,
    input.inclusionProof,
    input.commitment.merkleRoot,
  );

  return !included;
}
