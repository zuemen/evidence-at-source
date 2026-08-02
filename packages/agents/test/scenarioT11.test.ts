import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, credentialHash, generateKeyPair, presentCredential } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import {
  buildMerkleTree,
  createRecordSetCommitment,
  getInclusionProof,
} from '@eas/integrity';
import { buildOmissionCohort, createBrandAgent, type HeldRecord } from '@eas/agents';

const COHORT = 'factory-a';
const WINDOW = '2026-08';
const META = { periodStart: '2026-08-01', periodEnd: '2026-08-31', factoryDID: 'did:web:factory.example' };

/**
 * T11 — the factory publishes a commitment that leaves out one worker's record.
 *
 * All five workers hold genuine, counter-signed working-hours credentials. The
 * factory's published record set includes only four of them. The omitted worker
 * still holds their credential, so the gap is detectable — and the audit answer
 * names nobody.
 */
describe('T11 — omission detection across a cohort', () => {
  test('a record left out of the commitment is counted, without revealing who', async () => {
    const factory = await createIssuer('did:web:factory.example');

    // Five workers each hold a counter-signed working-hours credential.
    const recordHashes: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const worker = await generateKeyPair();
      const credential = await factory.issue('WorkingHoursCredential', {
        workerDID: `did:key:zWorker${String(i).padStart(3, '0')}`,
        withinRBALimit: true,
        periodStart: '2026-08-01',
        totalHours: 180,
        overtimeHours: 30,
      });
      await createWorkerAttestation(worker.privateKey, {
        workerDID: `did:key:zWorker${String(i).padStart(3, '0')}`,
        credential,
        deviceFingerprint: `sha256:synthetic-device-${i}`,
      });
      recordHashes.push(credentialHash(await presentCredential(credential, ['withinRBALimit'])));
    }

    // The factory commits to only the first four records; worker 5 is omitted.
    const published = recordHashes.slice(0, 4);
    const { commitment } = createRecordSetCommitment(published, META);
    const publishedTree = buildMerkleTree(published);

    // Each worker asks for an inclusion proof; the factory can produce one only
    // for records it actually committed to.
    const heldRecords: HeldRecord[] = recordHashes.map((hash, index) => ({
      recordHash: hash,
      inclusionProof: index < 4 ? getInclusionProof(publishedTree, index) : null,
    }));

    const cohort = buildOmissionCohort({ cohort: COHORT, window: WINDOW, commitment, heldRecords });
    const agent = createBrandAgent([], [], [cohort]);

    const count = agent.getOmissionSignalCount(COHORT, WINDOW);
    const coverage = agent.getCommitmentCoverage(COHORT, WINDOW);

    expect(count.ok).toBe(true);
    expect(count.ok === true && count.count).toBe(1);
    expect(coverage.ok === true && coverage.coverage).toBeCloseTo(4 / 5);

    // The answer names nobody.
    const serialised = JSON.stringify(count) + JSON.stringify(coverage);
    expect(serialised).not.toContain('zWorker');
    expect(serialised).not.toContain('did:key');
  });
});
