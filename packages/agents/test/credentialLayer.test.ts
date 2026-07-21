import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { checkCredentialLayer } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';
const DEVICE = 'sha256:synthetic-device-001';

const HOURS_CLAIMS = {
  workerDID: WORKER_DID,
  withinRBALimit: true,
  periodStart: '2026-08-01',
  totalHours: 186,
  overtimeHours: 42,
} as const;

async function buildPresentation(disclose: readonly string[] = ['withinRBALimit', 'periodStart']) {
  const factory = await createIssuer('did:web:factory.example');
  const worker = await generateKeyPair();

  const credential = await factory.issue('WorkingHoursCredential', { ...HOURS_CLAIMS });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: DEVICE,
  });
  const presentation = await presentCredential(credential, disclose);

  return { factory, worker, credential, attestation, presentation };
}

describe('Policy Gate L1 — credential layer', () => {
  test('admits a genuine, counter-signed, sufficiently disclosed presentation', async () => {
    const { factory, worker, attestation, presentation } = await buildPresentation();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);
    expect(decision.ok === true && decision.payload['withinRBALimit']).toBe(true);
  });

  test('refuses a presentation not signed by the expected issuer', async () => {
    const { worker, attestation, presentation } = await buildPresentation();
    const unrelatedIssuer = await createIssuer('did:web:someone-else.example');

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: unrelatedIssuer.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('INVALID_ISSUER_SIGNATURE');
  });

  test('refuses when the attestation pairs with a different credential', async () => {
    const { factory, worker, presentation } = await buildPresentation();
    const other = await buildPresentation();

    const decision = await checkCredentialLayer({
      presentation,
      attestation: other.attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: other.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('ATTESTATION_HASH_MISMATCH');
  });

  test('refuses when the policy needs a claim this credential does not carry', async () => {
    // The policy wants proof about document custody, but the worker presented a
    // working-hours credential. Public claims like `withinRBALimit` are always
    // present, so the realistic gap is a claim the credential never had.
    const { factory, worker, attestation, presentation } = await buildPresentation();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['passportHeldByWorker'],
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CLAIM_NOT_DISCLOSED');
  });

  test('a hidden field the worker did not disclose is absent from the payload', async () => {
    const { factory, worker, attestation, presentation } = await buildPresentation();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok === true && 'totalHours' in decision.payload).toBe(false);
  });
});
