import { describe, expect, test } from 'vitest';
import {
  createWorkerAttestation,
  generateKeyPair,
  signCredential,
  verifyPairing,
} from '@eas/shared';

const WORKER_DID = 'did:key:zWorker001';

async function issueHoursCredential(totalHours: number) {
  const issuerKeys = await generateKeyPair();
  const credential = await signCredential(
    issuerKeys.privateKey,
    {
      iss: 'did:web:factory.example',
      iat: Math.floor(Date.now() / 1000),
      vct: 'WorkingHoursCredential',
      workerDID: WORKER_DID,
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours,
      overtimeHours: 42,
    },
    ['totalHours', 'overtimeHours'],
  );

  return credential;
}

describe('worker attestation pairing', () => {
  test('accepts an attestation that points at the credential it was signed for', async () => {
    const worker = await generateKeyPair();
    const credential = await issueHoursCredential(186);

    const attestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-001',
    });

    const result = await verifyPairing(attestation, credential, worker.publicKey);

    expect(result.ok).toBe(true);
  });

  test('rejects an attestation signed by a different worker', async () => {
    const worker = await generateKeyPair();
    const impostor = await generateKeyPair();
    const credential = await issueHoursCredential(186);

    const attestation = await createWorkerAttestation(impostor.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-002',
    });

    const result = await verifyPairing(attestation, credential, worker.publicKey);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('MISSING_WORKER_ATTESTATION');
  });
});
