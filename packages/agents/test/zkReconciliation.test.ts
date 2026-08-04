import { describe, expect, test } from 'vitest';
import {
  createRevocationDirectory,
  createWorkerAttestation,
  credentialHash,
  generateKeyPair,
  presentCredential,
} from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import {
  verifyReconciliationProof,
  type ReconciliationProofPublicSignals,
} from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

async function boundCredential(
  issuer: Awaited<ReturnType<typeof createIssuer>>,
  type: 'WorkingHoursCredential' | 'SalaryDepositCredential',
  workerDID: string,
) {
  const worker = await generateKeyPair();
  const claims =
    type === 'WorkingHoursCredential'
      ? { workerDID, withinRBALimit: true, periodStart: '2026-08-01', totalHours: 186, overtimeHours: 42 }
      : { workerDID, periodStart: '2026-08-01', periodEnd: '2026-08-31', issuerType: 'BANK', depositedAmountTWD: 38000, depositCount: 1 };
  const credential = await issuer.issue(type, claims);
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });
  const disclose =
    type === 'WorkingHoursCredential'
      ? ['withinRBALimit', 'periodStart']
      : ['periodStart', 'periodEnd', 'issuerType'];
  const presentation = await presentCredential(credential, disclose);

  return {
    presentation,
    attestation,
    issuerPublicKey: issuer.publicKey,
    workerPublicKey: worker.publicKey,
  };
}

async function scenario(workerDIDs: { hours: string; salary: string } = { hours: WORKER_DID, salary: WORKER_DID }) {
  const factory = await createIssuer('did:web:factory.example');
  const bank = await createIssuer('did:web:bank.example');
  const hours = await boundCredential(factory, 'WorkingHoursCredential', workerDIDs.hours);
  const salary = await boundCredential(bank, 'SalaryDepositCredential', workerDIDs.salary);

  const publicSignals: ReconciliationProofPublicSignals = {
    hoursCredentialHash: credentialHash(hours.presentation),
    salaryCredentialHash: credentialHash(salary.presentation),
    legalWageRate: 190,
    overtimeMultiplier: 1.34,
    toleranceBps: 1500,
    consistent: true,
  };

  return { hours, salary, publicSignals };
}

const acceptProof = () => true;

describe('ZK reconciliation binding (Phase 4, circuit downgraded)', () => {
  test('binding check 1: an invalid proof is rejected', async () => {
    const { hours, salary, publicSignals } = await scenario();

    const result = await verifyReconciliationProof({
      proof: {},
      publicSignals,
      hours,
      salary,
      verifyProof: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('PROOF_INVALID');
  });

  test('binding check 2: hoursCredentialHash must match a presented valid credential', async () => {
    const { hours, salary, publicSignals } = await scenario();

    const result = await verifyReconciliationProof({
      proof: {},
      publicSignals: { ...publicSignals, hoursCredentialHash: 'not-the-real-hash' },
      hours,
      salary,
      verifyProof: acceptProof,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('PROOF_BINDING_MISMATCH');
  });

  test('binding check 3: a revoked salary credential fails the binding', async () => {
    const { hours, salary, publicSignals } = await scenario();
    const dir = createRevocationDirectory();
    dir.revokeCredential(credentialHash(salary.presentation));

    const result = await verifyReconciliationProof({
      proof: {},
      publicSignals,
      hours,
      salary,
      revocations: dir.credentialRevocations,
      verifyProof: acceptProof,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('CREDENTIAL_REVOKED');
  });

  test('binding check 4: the two credentials must name the same worker', async () => {
    const { hours, salary, publicSignals } = await scenario({
      hours: WORKER_DID,
      salary: 'did:key:zSomeoneElse',
    });

    const result = await verifyReconciliationProof({
      proof: {},
      publicSignals,
      hours,
      salary,
      verifyProof: acceptProof,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('PROOF_SUBJECT_MISMATCH');
  });

  test('a valid proof bound to two valid same-worker credentials verifies', async () => {
    const { hours, salary, publicSignals } = await scenario();

    const result = await verifyReconciliationProof({
      proof: {},
      publicSignals,
      hours,
      salary,
      verifyProof: acceptProof,
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.consistent).toBe(true);
  });
});
