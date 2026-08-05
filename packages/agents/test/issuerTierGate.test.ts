import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { createIssuer, type IssuerOptions } from '@eas/issuer';
import { checkCredentialLayer } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

async function present(options: IssuerOptions) {
  const issuer = await createIssuer('did:web:factory.example', options);
  const worker = await generateKeyPair();
  const credential = await issuer.issue('WorkingHoursCredential', {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
  });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });

  return {
    issuer,
    worker,
    attestation,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
  };
}

const gate = (p: Awaited<ReturnType<typeof present>>, extra: Record<string, unknown> = {}) =>
  checkCredentialLayer({
    presentation: p.presentation,
    attestation: p.attestation,
    issuerPublicKey: p.issuer.publicKey,
    workerPublicKey: p.worker.publicKey,
    requiredClaims: ['withinRBALimit'],
    ...extra,
  });

describe('L1 — minimum issuer tier (題06 Q1)', () => {
  test('refuses a self-declared credential when third-party backing is required', async () => {
    const p = await present({ tier: 'SELF_DECLARED' });

    const decision = await gate(p, { minimumIssuerTier: 'THIRD_PARTY_VERIFIED' });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('ISSUER_TIER_BELOW_THRESHOLD');
  });

  test('admits a third-party-verified credential at the same threshold', async () => {
    const p = await present({ tier: 'THIRD_PARTY_VERIFIED', verifiedBy: 'did:web:sgs.example' });

    const decision = await gate(p, { minimumIssuerTier: 'THIRD_PARTY_VERIFIED' });

    expect(decision.ok).toBe(true);
    expect(decision.ok === true && decision.payload['verifiedBy']).toBe('did:web:sgs.example');
  });

  test('an authority-certified credential clears a third-party threshold', async () => {
    const p = await present({ tier: 'AUTHORITY_CERTIFIED' });

    expect((await gate(p, { minimumIssuerTier: 'THIRD_PARTY_VERIFIED' })).ok).toBe(true);
  });

  test('issuers default to SELF_DECLARED and pass when no threshold is set', async () => {
    const p = await present({});

    const decision = await gate(p);

    expect(decision.ok).toBe(true);
    expect(decision.ok === true && decision.payload['issuerTier']).toBe('SELF_DECLARED');
  });
});

describe('L1 — facility binding (GS1 anti-reuse)', () => {
  test('refuses a credential from factory A when factory B is expected', async () => {
    const p = await present({ facilityId: 'gs1:factory-a' });

    const decision = await gate(p, { expectedFacilityId: 'gs1:factory-b' });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_FACILITY_MISMATCH');
  });

  test('admits a credential whose facility matches', async () => {
    const p = await present({ facilityId: 'gs1:factory-a' });

    expect((await gate(p, { expectedFacilityId: 'gs1:factory-a' })).ok).toBe(true);
  });

  test('a credential with no facility cannot answer for a specific line', async () => {
    const p = await present({});

    const decision = await gate(p, { expectedFacilityId: 'gs1:factory-a' });

    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_FACILITY_MISMATCH');
  });
});
