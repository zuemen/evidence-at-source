/**
 * A small binary Merkle tree.
 *
 * Leaves and internal nodes are hashed with different domain prefixes (0x00 for
 * leaves, 0x01 for nodes) so that a leaf value can never be presented as an
 * internal node — the classic second-preimage defence. An odd node at any level
 * is promoted unchanged to the next level.
 */

import { createHash } from 'node:crypto';

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

function sha256Hex(...parts: Buffer[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function hashLeaf(leaf: string): string {
  return sha256Hex(LEAF_PREFIX, Buffer.from(leaf, 'utf8'));
}

function hashNode(left: string, right: string): string {
  return sha256Hex(NODE_PREFIX, Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export interface MerkleTree {
  readonly root: string;
  /** Bottom-up layers; layer 0 is the hashed leaves. */
  readonly layers: readonly string[][];
}

export interface ProofStep {
  readonly hash: string;
  readonly position: 'left' | 'right';
}

export type InclusionProof = readonly ProofStep[];

export function buildMerkleTree(leaves: readonly string[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error('cannot build a Merkle tree over zero records');
  }

  const base = leaves.map(hashLeaf);
  const layers: string[][] = [base];

  while (layers[layers.length - 1]!.length > 1) {
    const current = layers[layers.length - 1]!;
    const next: string[] = [];

    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1];
      // Odd node is promoted unchanged rather than duplicated.
      next.push(right === undefined ? left : hashNode(left, right));
    }

    layers.push(next);
  }

  return { root: layers[layers.length - 1]![0]!, layers };
}

export function getInclusionProof(tree: MerkleTree, leafIndex: number): InclusionProof {
  const proof: ProofStep[] = [];
  let index = leafIndex;

  for (let level = 0; level < tree.layers.length - 1; level += 1) {
    const layer = tree.layers[level]!;
    const isRightChild = index % 2 === 1;
    const siblingIndex = isRightChild ? index - 1 : index + 1;
    const sibling = layer[siblingIndex];

    // No sibling means this node was promoted; nothing to add at this level.
    if (sibling !== undefined) {
      proof.push({ hash: sibling, position: isRightChild ? 'left' : 'right' });
    }

    index = Math.floor(index / 2);
  }

  return proof;
}

export function verifyInclusionProof(
  leaf: string,
  proof: InclusionProof,
  root: string,
): boolean {
  let running = hashLeaf(leaf);

  for (const step of proof) {
    running =
      step.position === 'left' ? hashNode(step.hash, running) : hashNode(running, step.hash);
  }

  return running === root;
}
