import { describe, expect, test } from 'vitest';
import { importJWK, jwtVerify } from 'jose';
import {
  createWorkerAttestation,
  generateKeyPair,
  signCredential,
  verifyPairing,
} from '@eas/shared';

const WORKER_DID = 'did:key:zWorker001';

async function issueCredential() {
  const issuer = await generateKeyPair();
  return signCredential(
    issuer.privateKey,
    {
      iss: 'did:web:factory.example',
      iat: Math.floor(Date.now() / 1000),
      vct: 'WorkingHoursCredential',
      workerDID: WORKER_DID,
      withinRBALimit: true,
    },
    [],
  );
}

describe('worker attestation purpose (incentive chain)', () => {
  test('the worker can state why they are counter-signing, and it is carried', async () => {
    const worker = await generateKeyPair();
    const credential = await issueCredential();

    const attestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-001',
      purpose: '為在台開戶之身份與意願查驗而反簽',
    });

    const key = await importJWK(worker.publicKey, 'ES256');
    const { payload } = await jwtVerify(attestation, key);

    expect(payload['purpose']).toBe('為在台開戶之身份與意願查驗而反簽');
  });

  test('purpose is optional and its absence does not break pairing', async () => {
    const worker = await generateKeyPair();
    const credential = await issueCredential();

    const attestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-001',
    });

    const result = await verifyPairing(attestation, credential, worker.publicKey);

    expect(result.ok).toBe(true);
  });
});
