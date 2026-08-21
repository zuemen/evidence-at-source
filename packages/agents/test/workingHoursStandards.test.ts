/**
 * 工時：週與月是兩套單位，加班自願只能由勞工說。
 */
import { describe, expect, test } from 'vitest';
import {
  createWorkerAttestation,
  generateKeyPair,
  overtimeVoluntary,
  presentCredential,
} from '@eas/shared';
import { checkCredentialLayer } from '@eas/agents';
import { setupIssuerWorld } from './helpers/vleiWorld.js';

const WORKER_DID = 'did:key:zWorker001';

async function issued(claims: Record<string, unknown>) {
  const world = await setupIssuerWorld();
  const worker = await generateKeyPair();
  const credential = await world.issuer.issue('WorkingHoursCredential', {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 232,
    overtimeHours: 52,
    ...claims,
  });

  return {
    world,
    worker,
    credential,
    attestation: await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-001',
    }),
  };
}

describe('週合規但月超標：兩個判準必須能分開回答', () => {
  test('a timesheet can clear the weekly bar and breach the monthly one', async () => {
    // 58 hours a week for four weeks: compliant every single week under RBA,
    // far past Taiwan's 46 monthly overtime hours. One boolean cannot say this.
    const setup = await issued({
      withinRBAWeeklyLimit: true,
      withinLocalMonthlyLimit: false,
      weeklyHoursLimit: 60,
      standardVersion: 'RBA-CoC-8.0',
    });

    const decision = await checkCredentialLayer({
      presentation: await presentCredential(setup.credential, [
        'withinRBAWeeklyLimit',
        'withinLocalMonthlyLimit',
      ]),
      attestation: setup.attestation,
      issuerPublicKey: setup.world.issuerKey,
      workerPublicKey: setup.worker.publicKey,
      requiredClaims: ['withinRBAWeeklyLimit', 'withinLocalMonthlyLimit'],
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.payload['withinRBAWeeklyLimit']).toBe(true);
    expect(decision.payload['withinLocalMonthlyLimit']).toBe(false);
  });

  test('每七日一休是獨立的一項，不由工時總數推導', async () => {
    // A worker can be under 60 hours and still have worked 14 days straight.
    const setup = await issued({ restDayCompliant: false, withinRBAWeeklyLimit: true });

    const decision = await checkCredentialLayer({
      presentation: await presentCredential(setup.credential, ['restDayCompliant']),
      attestation: setup.attestation,
      issuerPublicKey: setup.world.issuerKey,
      workerPublicKey: setup.worker.publicKey,
      requiredClaims: ['restDayCompliant'],
    });

    expect(decision.ok && decision.payload['restDayCompliant']).toBe(false);
  });
});

describe('overtimeVoluntary：沒有勞工反簽就不得為真', () => {
  test('the rule itself refuses an unattested claim', () => {
    expect(overtimeVoluntary({ claimed: true, attested: false })).toBe(false);
  });

  test('and refuses a withdrawn one', () => {
    expect(overtimeVoluntary({ claimed: true, attested: true, withdrawn: true })).toBe(false);
  });

  test('an attested, unwithdrawn claim is the only true case', () => {
    expect(overtimeVoluntary({ claimed: true, attested: true })).toBe(true);
  });

  test('a malformed claim is not an established one', () => {
    expect(overtimeVoluntary({ claimed: 'yes', attested: true })).toBe(false);
    expect(overtimeVoluntary({ claimed: undefined, attested: true })).toBe(false);
  });

  test('the gate reports it true when the worker counter-signed', async () => {
    const setup = await issued({ overtimeVoluntary: true });

    const decision = await checkCredentialLayer({
      presentation: await presentCredential(setup.credential, ['overtimeVoluntary']),
      attestation: setup.attestation,
      issuerPublicKey: setup.world.issuerKey,
      workerPublicKey: setup.worker.publicKey,
      requiredClaims: ['overtimeVoluntary'],
    });

    expect(decision.ok && decision.payload['overtimeVoluntary']).toBe(true);
  });

  test('withdrawal turns it false without invalidating the hours record', async () => {
    // Withdrawal is not revocation. The worker must not have to destroy their
    // own evidence in order to say the overtime was not voluntary.
    const setup = await issued({ overtimeVoluntary: true });

    const decision = await checkCredentialLayer({
      presentation: await presentCredential(setup.credential, [
        'overtimeVoluntary',
        'periodStart',
      ]),
      attestation: setup.attestation,
      issuerPublicKey: setup.world.issuerKey,
      workerPublicKey: setup.worker.publicKey,
      requiredClaims: ['overtimeVoluntary'],
      overtimeConsentWithdrawn: true,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.payload['overtimeVoluntary']).toBe(false);
    // The rest of the record survives.
    expect(decision.payload['periodStart']).toBe('2026-08-01');
  });

  test('一個沒有反簽的憑證根本過不了閘門，所以這一欄無從偽稱', async () => {
    // The stronger structural point: the pairing check refuses an unsigned
    // credential outright, so there is no path where the gate sees a
    // factory's voluntariness claim without a worker signature behind it.
    const setup = await issued({ overtimeVoluntary: true });

    const decision = await checkCredentialLayer({
      presentation: await presentCredential(setup.credential, ['overtimeVoluntary']),
      attestation: '',
      issuerPublicKey: setup.world.issuerKey,
      workerPublicKey: setup.worker.publicKey,
      requiredClaims: ['overtimeVoluntary'],
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.reason).toBe('MISSING_WORKER_ATTESTATION');
  });
});
