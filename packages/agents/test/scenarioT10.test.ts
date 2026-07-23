import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { DEFAULT_RECONCILIATION_PARAMS, reconcile } from '@eas/reconciliation';
import { checkCredentialLayer } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

/**
 * T10 — cross-validation catches omission-style fraud.
 *
 * The factory reports 150 hours, comfortably within the limit, so the working
 * hours credential looks clean on its own. But the bank deposited pay worth
 * roughly 186 hours of work. The two independent issuers disagree, and only
 * their disagreement reveals the hours that were never written down.
 */
describe('T10 — reconciliation across two independent issuers', () => {
  test('a deposit larger than the reported hours yields DISCREPANCY_OVERPAID', async () => {
    const factory = await createIssuer('did:web:factory.example');
    const bank = await createIssuer('did:web:bank.example');
    const worker = await generateKeyPair();

    // Two different issuer identities: neither controls the other.
    expect(factory.did).not.toBe(bank.did);

    const hoursCred = await factory.issue('WorkingHoursCredential', {
      workerDID: WORKER_DID,
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 150,
      overtimeHours: 10,
    });
    const salaryCred = await bank.issue('SalaryDepositCredential', {
      workerDID: WORKER_DID,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      issuerType: 'BANK',
      depositedAmountTWD: 38000,
      depositCount: 1,
    });

    const hoursAttestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential: hoursCred,
      deviceFingerprint: 'sha256:synthetic-device-001',
    });
    const salaryAttestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential: salaryCred,
      deviceFingerprint: 'sha256:synthetic-device-001',
    });

    // The worker discloses the hidden figures to the reconciler (the trust this
    // places in the reconciler is exactly what Phase 4's ZK proof removes).
    const hoursPresentation = await presentCredential(hoursCred, [
      'withinRBALimit',
      'periodStart',
      'totalHours',
      'overtimeHours',
    ]);
    const salaryPresentation = await presentCredential(salaryCred, [
      'periodStart',
      'periodEnd',
      'issuerType',
      'depositedAmountTWD',
    ]);

    const hoursCheck = await checkCredentialLayer({
      presentation: hoursPresentation,
      attestation: hoursAttestation,
      issuerPublicKey: factory.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['totalHours', 'overtimeHours'],
    });
    const salaryCheck = await checkCredentialLayer({
      presentation: salaryPresentation,
      attestation: salaryAttestation,
      issuerPublicKey: bank.publicKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['depositedAmountTWD'],
    });

    expect(hoursCheck.ok).toBe(true);
    expect(salaryCheck.ok).toBe(true);
    if (!hoursCheck.ok || !salaryCheck.ok) return;

    // Both credentials name the same worker.
    expect(hoursCheck.payload['workerDID']).toBe(salaryCheck.payload['workerDID']);

    const outcome = reconcile(
      {
        totalHours: Number(hoursCheck.payload['totalHours']),
        overtimeHours: Number(hoursCheck.payload['overtimeHours']),
      },
      { depositedAmountTWD: Number(salaryCheck.payload['depositedAmountTWD']) },
      DEFAULT_RECONCILIATION_PARAMS,
    );

    expect(outcome.code).toBe('DISCREPANCY_OVERPAID');

    // The verdict leaks neither the amount nor the hours behind it.
    const serialised = JSON.stringify(outcome);
    for (const secret of ['38000', '150', '186', '10']) {
      expect(serialised).not.toContain(secret);
    }
  });
});
