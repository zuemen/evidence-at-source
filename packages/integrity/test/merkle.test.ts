import { describe, expect, test } from 'vitest';
import { buildMerkleTree, getInclusionProof, verifyInclusionProof } from '@eas/integrity';

const leaves = ['a', 'b', 'c', 'd', 'e'];

describe('merkle tree', () => {
  test('a stable root for the same leaves', () => {
    const one = buildMerkleTree(leaves).root;
    const two = buildMerkleTree(leaves).root;

    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });

  test('an inclusion proof verifies against the root', () => {
    const tree = buildMerkleTree(leaves);
    const proof = getInclusionProof(tree, 2);

    expect(verifyInclusionProof('c', proof, tree.root)).toBe(true);
  });

  test('every leaf has a verifiable proof, including the odd last one', () => {
    const tree = buildMerkleTree(leaves);

    leaves.forEach((leaf, index) => {
      const proof = getInclusionProof(tree, index);
      expect(verifyInclusionProof(leaf, proof, tree.root)).toBe(true);
    });
  });

  test('a leaf that is not in the tree does not verify', () => {
    const tree = buildMerkleTree(leaves);
    const proof = getInclusionProof(tree, 2);

    expect(verifyInclusionProof('z', proof, tree.root)).toBe(false);
  });

  test('a proof from one tree does not verify against a different root', () => {
    const tree = buildMerkleTree(leaves);
    const other = buildMerkleTree(['a', 'b', 'c', 'd']);
    const proof = getInclusionProof(tree, 0);

    expect(verifyInclusionProof('a', proof, other.root)).toBe(false);
  });
});
