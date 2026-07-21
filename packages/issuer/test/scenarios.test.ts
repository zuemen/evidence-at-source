import { describe, expect, test } from 'vitest';
import {
  createWorkerAttestation,
  generateKeyPair,
  presentCredential,
  verifyPairing,
  verifyPresentation,
} from '@eas/shared';
import { createIssuer } from '@eas/issuer';

const WORKER_DID = 'did:key:zWorker001';
const DEVICE = 'sha256:synthetic-device-001';

const HOURS_CLAIMS = {
  workerDID: WORKER_DID,
  withinRBALimit: true,
  periodStart: '2026-08-01',
  totalHours: 186,
  overtimeHours: 42,
} as const;

describe('T2 — honest issuance, counter-signature and presentation', () => {
  test('a verifier gets the conclusion, the pairing holds, and raw hours stay hidden', async () => {
    const factory = await createIssuer('did:web:factory.example');
    const worker = await generateKeyPair();

    const credential = await factory.issue('WorkingHoursCredential', { ...HOURS_CLAIMS });
    const attestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: DEVICE,
    });

    // The verifier only ever receives the presentation, never the full credential.
    const presentation = await presentCredential(credential, ['withinRBALimit', 'periodStart']);

    const pairing = await verifyPairing(attestation, presentation, worker.publicKey);
    const verified = await verifyPresentation(presentation, factory.publicKey);

    expect(pairing.ok).toBe(true);
    expect(verified.payload['withinRBALimit']).toBe(true);
    expect('totalHours' in verified.payload).toBe(false);
  });
});

describe('T4 — post-hoc tampering by the employer', () => {
  test('re-issuing with lower hours breaks the pairing', async () => {
    const factory = await createIssuer('did:web:factory.example');
    const worker = await generateKeyPair();

    const original = await factory.issue('WorkingHoursCredential', { ...HOURS_CLAIMS });
    const attestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential: original,
      deviceFingerprint: DEVICE,
    });

    // The factory rewrites history: 186 hours becomes 150, overtime 42 becomes 10.
    const tampered = await factory.issue('WorkingHoursCredential', {
      ...HOURS_CLAIMS,
      totalHours: 150,
      overtimeHours: 10,
    });
    const tamperedPresentation = await presentCredential(tampered, [
      'withinRBALimit',
      'periodStart',
    ]);

    const result = await verifyPairing(attestation, tamperedPresentation, worker.publicKey);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('ATTESTATION_HASH_MISMATCH');
  });
});
