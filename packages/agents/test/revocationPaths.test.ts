import { describe, expect, test } from 'vitest';
import {
  createRevocationDirectory,
  createWorkerAttestation,
  credentialHash,
  generateKeyPair,
  presentCredential,
  type PublicJwk,
} from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { checkAgentDelegation, checkCredentialLayer } from '@eas/agents';

const AGENT_DID = 'did:key:zBankAgent';

async function workerCredential(factory: Awaited<ReturnType<typeof createIssuer>>, workerDID: string) {
  const worker = await generateKeyPair();
  const credential = await factory.issue('WorkingHoursCredential', {
    workerDID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 180,
    overtimeHours: 30,
  });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });
  const presentation = await presentCredential(credential, ['withinRBALimit', 'periodStart']);

  return { worker, presentation, attestation };
}

describe('P3 — three revocation paths', () => {
  test('Path A: an issuer withdraws one credential; it is refused at L1', async () => {
    const factory = await createIssuer('did:web:factory.example');
    const dir = createRevocationDirectory();
    const w = await workerCredential(factory, 'did:key:zWorker001');

    dir.revokeCredential(credentialHash(w.presentation));

    const decision = await checkCredentialLayer({
      presentation: w.presentation,
      attestation: w.attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: w.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      revocations: dir.credentialRevocations,
    });

    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_REVOKED');
  });

  test('Path B: revoking the worker cascades to their credentials but not others', async () => {
    const factory = await createIssuer('did:web:factory.example');
    const dir = createRevocationDirectory();
    const mine = await workerCredential(factory, 'did:key:zWorker001');
    const other = await workerCredential(factory, 'did:key:zWorker002');

    dir.revokeWorker('did:key:zWorker001');

    const mineDecision = await checkCredentialLayer({
      presentation: mine.presentation,
      attestation: mine.attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: mine.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      revocations: dir.credentialRevocations,
    });
    const otherDecision = await checkCredentialLayer({
      presentation: other.presentation,
      attestation: other.attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: other.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      revocations: dir.credentialRevocations,
    });

    expect(mineDecision.ok === false && mineDecision.reason).toBe('CREDENTIAL_REVOKED');
    expect(otherDecision.ok).toBe(true);
  });

  test('Path C: an institution revokes an agent; it is refused at L0', async () => {
    const bank = await createIssuer('did:web:bank.example');
    const dir = createRevocationDirectory();
    const knownInstitutions: Record<string, PublicJwk> = { 'did:web:bank.example': bank.publicKey };
    const delegation = await bank.issueDelegation({
      agentDid: AGENT_DID,
      principalName: '國泰世華銀行',
      allowedQueryTypes: ['boolean'],
      scope: ['WorkingHoursCredential'],
      purpose: '查驗',
    });

    dir.revokeAgent(AGENT_DID);

    const decision = await checkAgentDelegation({
      signedDelegation: delegation,
      requestedQueryType: 'boolean',
      requestedCredentialType: 'WorkingHoursCredential',
      knownInstitutions,
      revocations: dir.delegationRevocations,
    });

    expect(decision.ok === false && decision.reason).toBe('AGENT_DELEGATION_REVOKED');
  });

  test('the three paths are independent: revoking an agent leaves worker credentials valid', async () => {
    const factory = await createIssuer('did:web:factory.example');
    const dir = createRevocationDirectory();
    const w = await workerCredential(factory, 'did:key:zWorker001');

    dir.revokeAgent(AGENT_DID);

    const decision = await checkCredentialLayer({
      presentation: w.presentation,
      attestation: w.attestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: w.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      revocations: dir.credentialRevocations,
    });

    expect(decision.ok).toBe(true);
  });
});
