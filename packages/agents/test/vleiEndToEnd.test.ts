import { describe, expect, test, vi } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { createVleiIssuer } from '@eas/issuer';
import {
  checkCredentialLayer,
  resolveIssuerSigningKey,
  runAuthorizedGate,
  type DelegationContext,
} from '@eas/agents';
import { bootstrapEcosystem, type SignedAcdc, type VleiPresentation } from '@eas/vlei';

const WORKER_DID = 'did:key:zWorker001';
const AGENT_DID = 'did:key:zBankAgent';

async function world() {
  const eco = bootstrapEcosystem();
  const factory = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
  });
  const bank = await createVleiIssuer({
    didWeb: 'did:web:bank.example',
    legalName: '國泰世華銀行',
    leiTag: 'BANKEXAMPLE',
    ecosystem: eco,
  });
  const agentVlei = bank.grantAgentEcr(AGENT_DID);

  const worker = await generateKeyPair();
  const credential = await factory.issue('DocumentCustodyCredential', {
    workerDID: WORKER_DID,
    passportHeldByWorker: true,
    custodyConsentGiven: true,
    documentType: 'passport',
    documentHash: 'sha256:synthetic-document-hash',
    custodyLocation: 'worker residence locker',
  });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });
  const presentation = await presentCredential(credential, ['passportHeldByWorker']);

  const delegation = await bank.issueDelegation({
    agentDid: AGENT_DID,
    principalName: '國泰世華銀行',
    allowedQueryTypes: ['boolean'],
    scope: ['DocumentCustodyCredential'],
    purpose: '開戶申請的身份與意願查驗',
  });

  const l0: DelegationContext = {
    signedDelegation: delegation,
    agentVlei,
    trust: eco.trust,
    requestedQueryType: 'boolean',
    requestedCredentialType: 'DocumentCustodyCredential',
  };

  return { eco, factory, bank, agentVlei, worker, attestation, presentation, l0 };
}

describe('end to end — vLEI chain in front of both gate layers', () => {
  test('happy path: L0 passes on the chain, L1 verifies with the chain-resolved key', async () => {
    const w = await world();

    const result = await runAuthorizedGate(w.l0, async () => {
      const issuer = resolveIssuerSigningKey(w.factory.legalEntityPresentation(), w.eco.trust);
      if (!issuer.ok) return { ok: false as const, reason: issuer.reason };

      return checkCredentialLayer({
        presentation: w.presentation,
        attestation: w.attestation,
        issuerPublicKey: issuer.issuer.jwk,
        workerPublicKey: w.worker.publicKey,
        requiredClaims: ['passportHeldByWorker'],
      });
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.worker.ok).toBe(true);
    if (result.ok && result.worker.ok && 'payload' in result.worker) {
      expect(result.worker.payload['passportHeldByWorker']).toBe(true);
      // Principle two, spot-checked end to end: the hidden field is
      // cryptographically absent, not masked.
      expect('custodyLocation' in result.worker.payload).toBe(false);
    }
  });

  test('revoking the QVI credential cuts off the agent before any worker data is read', async () => {
    const w = await world();
    w.eco.revokeQviCredential();
    const workerReader = vi.fn(async () => ({ ok: true }) as const);

    const result = await runAuthorizedGate(w.l0, workerReader);

    expect(result.ok === false && result.reason).toBe('AGENT_VLEI_REVOKED');
    expect(workerReader).not.toHaveBeenCalled();
  });

  test('a tampered ECR chain is refused as AGENT_VLEI_CHAIN_INVALID', async () => {
    const w = await world();
    const focus = w.agentVlei.credentials[w.agentVlei.focus] as SignedAcdc;
    const forged: VleiPresentation = {
      focus: w.agentVlei.focus,
      credentials: {
        ...w.agentVlei.credentials,
        [w.agentVlei.focus]: {
          ...focus,
          acdc: { ...focus.acdc, a: { ...focus.acdc.a, agentDid: 'did:key:zEvilAgent' } },
        },
      },
    };
    const workerReader = vi.fn(async () => ({ ok: true }) as const);

    const result = await runAuthorizedGate({ ...w.l0, agentVlei: forged }, workerReader);

    expect(result.ok === false && result.reason).toBe('AGENT_VLEI_CHAIN_INVALID');
    expect(workerReader).not.toHaveBeenCalled();
  });

  test('a revoked factory LE credential blocks L1 with ISSUER_VLEI_REVOKED', async () => {
    const w = await world();
    const chain = w.factory.legalEntityPresentation();

    const before = resolveIssuerSigningKey(chain, w.eco.trust);
    expect(before.ok).toBe(true);

    w.factory.revokeLegalEntityCredential();

    const after = resolveIssuerSigningKey(chain, w.eco.trust);
    expect(after).toEqual({ ok: false, reason: 'ISSUER_VLEI_REVOKED' });
  });

  test('the cascade is scoped: revoking the bank LE breaks its agent but not the factory issuer', async () => {
    const w = await world();
    w.bank.revokeLegalEntityCredential();
    const workerReader = vi.fn(async () => ({ ok: true }) as const);

    const gate = await runAuthorizedGate(w.l0, workerReader);
    const factoryStanding = resolveIssuerSigningKey(
      w.factory.legalEntityPresentation(),
      w.eco.trust,
    );

    expect(gate.ok === false && gate.reason).toBe('AGENT_VLEI_REVOKED');
    expect(workerReader).not.toHaveBeenCalled();
    expect(factoryStanding.ok).toBe(true);
  });
});
