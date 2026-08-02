import { describe, expect, test } from 'vitest';
import { generateKeyPair } from '@eas/shared';
import {
  buildMerkleTree,
  createRecordSetCommitment,
  detectOmission,
  getInclusionProof,
  signCommitment,
  verifyCommitment,
} from '@eas/integrity';

const META = {
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  factoryDID: 'did:web:factory.example',
} as const;

// Five workers' record hashes for the period.
const ALL_RECORDS = ['h-w1', 'h-w2', 'h-w3', 'h-w4', 'h-w5'];

describe('record-set commitment', () => {
  test('a commitment carries the root, the count and the period', () => {
    const { commitment } = createRecordSetCommitment(ALL_RECORDS, META);

    expect(commitment.recordCount).toBe(5);
    expect(commitment.factoryDID).toBe('did:web:factory.example');
    expect(commitment.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a signed commitment verifies under the factory key and not another', async () => {
    const factory = await generateKeyPair();
    const impostor = await generateKeyPair();
    const { commitment } = createRecordSetCommitment(ALL_RECORDS, META);

    const signed = await signCommitment(factory.privateKey, commitment);

    const good = await verifyCommitment(signed, factory.publicKey);
    const bad = await verifyCommitment(signed, impostor.publicKey);

    expect(good?.merkleRoot).toBe(commitment.merkleRoot);
    expect(bad).toBeNull();
  });
});

describe('omission detection', () => {
  test('a held record with a valid inclusion proof is not an omission', () => {
    const { commitment } = createRecordSetCommitment(ALL_RECORDS, META);
    const tree = buildMerkleTree(ALL_RECORDS);
    const proof = getInclusionProof(tree, 2);

    const omitted = detectOmission({
      heldRecordHash: 'h-w3',
      commitment,
      inclusionProof: proof,
    });

    expect(omitted).toBe(false);
  });

  test('a held record the factory left out cannot be proven included → omission', () => {
    // The factory publishes a commitment over four records, deliberately
    // excluding worker 5, whose record it counter-signed and issued.
    const published = ['h-w1', 'h-w2', 'h-w3', 'h-w4'];
    const { commitment } = createRecordSetCommitment(published, META);

    // The factory cannot produce a valid inclusion proof for the omitted record.
    const omitted = detectOmission({
      heldRecordHash: 'h-w5',
      commitment,
      inclusionProof: null,
    });

    expect(omitted).toBe(true);
  });

  test('a forged proof for an omitted record still reads as an omission', () => {
    const published = ['h-w1', 'h-w2', 'h-w3', 'h-w4'];
    const { commitment } = createRecordSetCommitment(published, META);
    const wrongTree = buildMerkleTree(published);
    const borrowedProof = getInclusionProof(wrongTree, 0);

    const omitted = detectOmission({
      heldRecordHash: 'h-w5',
      commitment,
      inclusionProof: borrowedProof,
    });

    expect(omitted).toBe(true);
  });
});
