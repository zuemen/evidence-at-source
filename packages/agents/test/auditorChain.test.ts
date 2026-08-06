import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { AUDITOR_ROLE, bootstrapEcosystem } from '@eas/vlei';
import { createVleiIssuer } from '@eas/issuer';
import {
  checkCredentialLayer,
  createAuditorDirectory,
  requireIssuerSigningKey,
} from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';
const AUDITOR_DID = 'did:web:sgs.example';

const CLAIMS = {
  workerDID: WORKER_DID,
  withinRBALimit: true,
  periodStart: '2026-08-01',
  totalHours: 186,
  overtimeHours: 42,
};

/**
 * A factory endorsed by an audit body, both under the same GLEIF root.
 *
 * The audit body is a Legal Entity holding an ECR for the auditor role — the
 * same shape as an AI agent's authority, because "who may speak for this
 * organisation, in what capacity" is the same question either way.
 */
async function setup() {
  const eco = bootstrapEcosystem();
  const auditBody = await createVleiIssuer({
    didWeb: AUDITOR_DID,
    legalName: 'SGS 稽核（合成）',
    leiTag: 'SGSEXAMPLE',
    ecosystem: eco,
  });
  const factory = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
    options: { tier: 'THIRD_PARTY_VERIFIED', verifiedBy: AUDITOR_DID },
  });

  const auditors = createAuditorDirectory(eco.trust, [
    { did: AUDITOR_DID, presentation: auditBody.grantAgentEcr(AUDITOR_DID, AUDITOR_ROLE) },
  ]);
  const issuerKey = requireIssuerSigningKey(factory.legalEntityPresentation(), eco.trust);
  const worker = await generateKeyPair();
  const credential = await factory.issue('WorkingHoursCredential', CLAIMS);
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });
  const presentation = await presentCredential(credential, ['withinRBALimit', 'periodStart']);

  return {
    eco,
    auditBody,
    auditors,
    gate: (extra: Record<string, unknown> = {}) =>
      checkCredentialLayer({
        presentation,
        attestation,
        issuerPublicKey: issuerKey,
        workerPublicKey: worker.publicKey,
        requiredClaims: ['withinRBALimit'],
        ...extra,
      }),
  };
}

describe('a third-party endorsement has to resolve to an audit body (題06 Q1)', () => {
  test('a credential backed by a real audit body is admitted', async () => {
    const w = await setup();

    const decision = await w.gate({ auditors: w.auditors });

    expect(decision.ok).toBe(true);
  });

  test('a verifier with no directory cannot check, and does not pretend to', async () => {
    const w = await setup();

    const decision = await w.gate();

    expect(decision.ok).toBe(true);
  });

  test('a named backer that is not an audit body is refused', async () => {
    const w = await setup();
    const empty = createAuditorDirectory(w.eco.trust, []);

    const decision = await w.gate({ auditors: empty });

    expect(decision.ok === false && decision.reason).toBe('AUDITOR_CHAIN_INVALID');
  });

  test('striking off the audit body invalidates every endorsement it gave', async () => {
    // The cascade that makes this worth building: nothing is cached, so the
    // very next query after the revocation sees it.
    const w = await setup();
    expect((await w.gate({ auditors: w.auditors })).ok).toBe(true);

    w.auditBody.revokeAgentEcr(AUDITOR_DID);
    const after = await w.gate({ auditors: w.auditors });

    expect(after.ok === false && after.reason).toBe('AUDITOR_CHAIN_INVALID');
  });

  test('revoking the audit bodys own legal entity credential has the same effect', async () => {
    const w = await setup();

    w.auditBody.revokeLegalEntityCredential();
    const decision = await w.gate({ auditors: w.auditors });

    expect(decision.ok === false && decision.reason).toBe('AUDITOR_CHAIN_INVALID');
  });

  test('the directory reports who the backer is, for a reviewer to read', async () => {
    const w = await setup();

    expect(w.auditors.standing(AUDITOR_DID)?.legalName).toBe('SGS 稽核（合成）');
  });

  test('a body holding an agent role rather than an auditor role does not count', async () => {
    // Same organisation, wrong capacity. Roles are not interchangeable, and
    // accepting one for the other would let any agent endorse its own issuer.
    const eco = bootstrapEcosystem();
    const body = await createVleiIssuer({
      didWeb: AUDITOR_DID,
      legalName: 'SGS 稽核（合成）',
      leiTag: 'SGSEXAMPLE',
      ecosystem: eco,
    });

    const directory = createAuditorDirectory(eco.trust, [
      { did: AUDITOR_DID, presentation: body.grantAgentEcr(AUDITOR_DID) },
    ]);

    expect(directory.standing(AUDITOR_DID)).toBeUndefined();
  });
});
