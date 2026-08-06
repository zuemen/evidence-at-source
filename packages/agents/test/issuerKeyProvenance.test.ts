import { describe, expect, test } from 'vitest';
import { bootstrapEcosystem } from '@eas/vlei';
import { createVleiIssuer } from '@eas/issuer';
import {
  checkCredentialLayer,
  requireIssuerSigningKey,
  type IssuerSigningKey,
} from '@eas/agents';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';

const WORKER_DID = 'did:key:zWorker001';

async function issuedCredential() {
  const eco = bootstrapEcosystem();
  const factory = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
  });
  const worker = await generateKeyPair();
  const credential = await factory.issue('WorkingHoursCredential', {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
  });

  return {
    eco,
    factory,
    worker,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
    attestation: await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-001',
    }),
  };
}

describe('layer 1 accepts only issuer keys that arrived through a verified chain', () => {
  test('a key taken straight off the issuer is refused, however genuine it is', async () => {
    const { factory, worker, presentation, attestation } = await issuedCredential();

    // The very key the credential was signed with — but with no chain behind it.
    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: factory.publicKey as unknown as IssuerSigningKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision).toEqual({ ok: false, reason: 'ISSUER_VLEI_MISSING' });
  });

  test('the same key admitted through the legal-entity chain is accepted', async () => {
    const { eco, factory, worker, presentation, attestation } = await issuedCredential();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: requireIssuerSigningKey(factory.legalEntityPresentation(), eco.trust),
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);
  });

  test('requireIssuerSigningKey throws rather than returning an unusable key', async () => {
    const { factory } = await issuedCredential();
    const foreign = bootstrapEcosystem();

    // A chain presented against a root that never signed it.
    expect(() => requireIssuerSigningKey(factory.legalEntityPresentation(), foreign.trust)).toThrow(
      /ISSUER_VLEI_CHAIN_INVALID/,
    );
  });
});
