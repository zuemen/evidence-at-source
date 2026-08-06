import { describe, expect, test } from 'vitest';
import {
  createRevocationRegistry,
  createWorkerAttestation,
  credentialHash,
  generateKeyPair,
  presentCredential,
} from '@eas/shared';
import { setupIssuerWorld } from './helpers/vleiWorld.js';
import { checkCredentialLayer } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

const CLAIMS = {
  workerDID: WORKER_DID,
  withinRBALimit: true,
  periodStart: '2026-08-01',
  totalHours: 186,
  overtimeHours: 42,
} as const;

async function present(workerDID: string = WORKER_DID) {
  const world = await setupIssuerWorld();
  const factory = world.issuer;
  const worker = await generateKeyPair();

  const credential = await factory.issue('WorkingHoursCredential', { ...CLAIMS, workerDID });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID,
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

describe('revocation', () => {
  test('a revoked credential is refused by the credential layer', async () => {
    const { issuerKey, worker, attestation, presentation } = await present();
    const revocations = createRevocationRegistry();

    revocations.revokeCredential(credentialHash(presentation));

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: issuerKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      revocations,
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_REVOKED');
  });

  test('revoking the subject cascades to every credential about that worker', async () => {
    const hours = await present();
    const revocations = createRevocationRegistry();

    // The worker has left the country: everything about them stops being usable,
    // without anyone having to enumerate their credentials.
    revocations.revokeSubject(WORKER_DID);

    const decision = await checkCredentialLayer({
      presentation: hours.presentation,
      attestation: hours.attestation,
      issuerPublicKey: hours.issuerKey,
      workerPublicKey: hours.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      revocations,
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_REVOKED');
  });

  test('a cascade does not touch other workers', async () => {
    const other = await present('did:key:zWorker002');
    const revocations = createRevocationRegistry();

    revocations.revokeSubject(WORKER_DID);

    const decision = await checkCredentialLayer({
      presentation: other.presentation,
      attestation: other.attestation,
      issuerPublicKey: other.issuerKey,
      workerPublicKey: other.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      revocations,
    });

    expect(decision.ok).toBe(true);
  });

  test('without a registry nothing is treated as revoked', async () => {
    const { issuerKey, worker, attestation, presentation } = await present();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: issuerKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);
  });
});
