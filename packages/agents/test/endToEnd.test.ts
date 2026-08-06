import { describe, expect, test } from 'vitest';
import {
  createWorkerAttestation,
  generateKeyPair,
  presentCredential,
  type PublicJwk,
} from '@eas/shared';
import { buildCohortEvidence, createBrandAgent, type Submission } from '@eas/agents';
import { setupIssuerWorld, type IssuerWorld } from './helpers/vleiWorld.js';

const COHORT = 'factory-a-2026-08';
const DISCLOSE = ['withinRBALimit', 'periodStart'] as const;

async function submit(
  world: IssuerWorld,
  index: number,
  withinRBALimit: boolean,
  options: { tamper?: boolean } = {},
): Promise<Submission & { workerPublicKey: PublicJwk }> {
  const worker = await generateKeyPair();
  const workerDID = `did:key:zWorker${String(index).padStart(3, '0')}`;

  const claims = {
    workerDID,
    withinRBALimit,
    periodStart: '2026-08-01',
    totalHours: withinRBALimit ? 186 : 260,
    overtimeHours: withinRBALimit ? 42 : 96,
  };

  const credential = await world.issuer.issue('WorkingHoursCredential', claims);
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID,
    credential,
    deviceFingerprint: `sha256:synthetic-device-${index}`,
  });

  // A tampering factory re-issues after the worker signed, lowering the hours.
  const effective = options.tamper
    ? await world.issuer.issue('WorkingHoursCredential', { ...claims, totalHours: 150, overtimeHours: 10 })
    : credential;

  return {
    presentation: await presentCredential(effective, DISCLOSE),
    attestation,
    issuerPublicKey: world.issuerKey,
    workerPublicKey: worker.publicKey,
  };
}

describe('end to end — presentation through both gate layers into an agent', () => {
  test('builds a cohort of conclusions, drops tampered evidence, and answers only aggregates', async () => {
    const world = await setupIssuerWorld();

    const submissions = [
      await submit(world, 1, true),
      await submit(world, 2, true),
      await submit(world, 3, true),
      await submit(world, 4, true),
      await submit(world, 5, false),
      await submit(world, 6, false),
      await submit(world, 7, true, { tamper: true }),
    ];

    const { evidence, rejected } = await buildCohortEvidence({
      cohort: COHORT,
      metric: 'workingHoursComplianceRate',
      claim: 'withinRBALimit',
      submissions,
    });

    // The tampered submission never reaches the agent.
    expect(rejected).toEqual(['ATTESTATION_HASH_MISMATCH']);
    expect(evidence.conclusions).toHaveLength(6);

    // Nothing that reaches the agent carries an identifier.
    expect(JSON.stringify(evidence)).not.toContain('zWorker');

    const agent = createBrandAgent([evidence]);

    const aggregate = agent.answer({
      kind: 'aggregate',
      metric: 'workingHoursComplianceRate',
      cohort: COHORT,
    });
    expect(aggregate.ok).toBe(true);
    expect(aggregate.ok === true && aggregate.rate).toBeCloseTo(4 / 6);
    expect(aggregate.ok === true && aggregate.compliant).toBe(false);

    const individual = agent.answer({ kind: 'individual', workerDID: 'did:key:zWorker005' });
    expect(individual.ok).toBe(false);
    expect(individual.ok === false && individual.reason).toBe('INDIVIDUAL_QUERY_REJECTED');
    expect(JSON.stringify(individual)).not.toContain('zWorker005');
  });
});
