import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { checkCredentialLayer } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

const CLAIMS = {
  workerDID: WORKER_DID,
  withinRBALimit: true,
  periodStart: '2026-08-01',
  totalHours: 186,
  overtimeHours: 42,
} as const;

async function present(lifetimeSeconds?: number) {
  const factory = await createIssuer(
    'did:web:factory.example',
    lifetimeSeconds === undefined ? undefined : { credentialLifetimeSeconds: lifetimeSeconds },
  );
  const worker = await generateKeyPair();

  const credential = await factory.issue('WorkingHoursCredential', { ...CLAIMS });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });

  return {
    factory,
    worker,
    attestation,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
  };
}

describe('credential expiry', () => {
  test('issued credentials carry an expiry a year out by default', async () => {
    const { factory, worker, attestation, presentation } = await present();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);

    const exp = decision.ok === true ? Number(decision.payload['exp']) : 0;
    const expectedExp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    expect(Math.abs(exp - expectedExp)).toBeLessThan(60);
  });

  test('the credential layer refuses a credential that has already expired', async () => {
    const { factory, worker, attestation, presentation } = await present(-10);

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_EXPIRED');
  });
});
