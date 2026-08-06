import { describe, expect, test } from 'vitest';
import {
  createRevocationDirectory,
  createWorkerAttestation,
  credentialHash,
  generateKeyPair,
  presentCredential,
  verifyPresentation,
} from '@eas/shared';
import {
  verifyReconciliationProof,
  type ReconciliationProofPublicSignals,
} from '@eas/agents';

import type { VleiIssuer } from '@eas/issuer';
import type { IssuerSigningKey } from '@eas/agents';
import { setupIssuerPairWorld } from './helpers/vleiWorld.js';

const WORKER_DID = 'did:key:zWorker001';

async function boundCredential(
  issuer: VleiIssuer,
  issuerKey: IssuerSigningKey,
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
    issuerPublicKey: issuerKey,
    workerPublicKey: worker.publicKey,
  };
}

async function scenario(workerDIDs: { hours: string; salary: string } = { hours: WORKER_DID, salary: WORKER_DID }) {
  const { factory, factoryKey, bank, bankKey } = await setupIssuerPairWorld();
  const hours = await boundCredential(factory, factoryKey, 'WorkingHoursCredential', workerDIDs.hours);
  const salary = await boundCredential(bank, bankKey, 'SalaryDepositCredential', workerDIDs.salary);

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

/** The circuit's public signals, in circuit order, for a given pair. */
async function circuitSignalsFor(
  hours: Awaited<ReturnType<typeof boundCredential>>,
  salary: Awaited<ReturnType<typeof boundCredential>>,
  verdict: '0' | '1' | '2' = '0',
): Promise<readonly string[]> {
  const hoursPayload = (await verifyPresentation(hours.presentation, hours.issuerPublicKey))
    .payload;
  const salaryPayload = (await verifyPresentation(salary.presentation, salary.issuerPublicKey))
    .payload;

  return [
    verdict,
    String(hoursPayload['valueCommitment']),
    String(salaryPayload['valueCommitment']),
    '190',
    '13400',
    '1500',
  ];
}

describe('ZK reconciliation binding (Phase 4)', () => {
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

  test('binding check 5: the circuit must have opened these credentials commitments', async () => {
    // The hole this closes: checks 2–4 establish that the credentials are real,
    // not that the proof is about them. Without this, a prover opens any pair
    // of commitments they know the preimages of while presenting a genuine,
    // unrelated pair of credentials — and everything else still passes.
    const { hours, salary, publicSignals } = await scenario();

    const result = await verifyReconciliationProof({
      proof: {},
      publicSignals: {
        ...publicSignals,
        circuitSignals: ['0', '111111', '222222', '190', '13400', '1500'],
      },
      hours,
      salary,
      verifyProof: acceptProof,
    });

    expect(result.ok === false && result.reason).toBe('PROOF_COMMITMENT_MISMATCH');
  });

  test('binding check 6: a caller cannot report CONSISTENT over a discrepant proof', async () => {
    const { hours, salary, publicSignals } = await scenario();

    const result = await verifyReconciliationProof({
      // Verdict 2 is DISCREPANCY_OVERPAID; the caller claims consistent: true.
      publicSignals: {
        ...publicSignals,
        circuitSignals: await circuitSignalsFor(hours, salary, '2'),
      },
      proof: {},
      hours,
      salary,
      verifyProof: acceptProof,
    });

    expect(result.ok === false && result.reason).toBe('PROOF_VERDICT_MISMATCH');
  });

  test('matching commitments and a matching verdict pass all six checks', async () => {
    const { hours, salary, publicSignals } = await scenario();

    const result = await verifyReconciliationProof({
      proof: {},
      publicSignals: {
        ...publicSignals,
        circuitSignals: await circuitSignalsFor(hours, salary),
      },
      hours,
      salary,
      verifyProof: acceptProof,
    });

    expect(result.ok).toBe(true);
  });
});
