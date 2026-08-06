import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { CREDENTIAL_LIFETIME_SECONDS } from '@eas/issuer';
import { checkCredentialLayer } from '@eas/agents';
import { setupIssuerWorld } from './helpers/vleiWorld.js';

const WORKER_DID = 'did:key:zWorker001';

const CLAIMS = {
  workerDID: WORKER_DID,
  withinRBALimit: true,
  periodStart: '2026-08-01',
  totalHours: 186,
  overtimeHours: 42,
} as const;

async function present(lifetimeSeconds?: number) {
  const world = await setupIssuerWorld(
    lifetimeSeconds === undefined ? undefined : { credentialLifetimeSeconds: lifetimeSeconds },
  );
  const factory = world.issuer;
  const worker = await generateKeyPair();

  const credential = await factory.issue('WorkingHoursCredential', { ...CLAIMS });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });

  return {
    issuerKey: world.issuerKey,
    worker,
    attestation,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
  };
}

describe('credential expiry', () => {
  test('an hours credential expires on the schedule its own fact justifies', async () => {
    // 題06 Q5: not one lifetime for everything. A pay period's hours go stale
    // in a quarter; a contract does not. The window comes from the type.
    const { issuerKey, worker, attestation, presentation } = await present();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: issuerKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);

    const exp = decision.ok === true ? Number(decision.payload['exp']) : 0;
    const expectedExp =
      Math.floor(Date.now() / 1000) + CREDENTIAL_LIFETIME_SECONDS.WorkingHoursCredential;
    expect(Math.abs(exp - expectedExp)).toBeLessThan(60);
  });

  test('the credential layer refuses a credential that has already expired', async () => {
    const { issuerKey, worker, attestation, presentation } = await present(-10);

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: issuerKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_EXPIRED');
  });
});
