import { describe, expect, test } from 'vitest';
import {
  createEnrollmentRegistry,
  createWorkerAttestation,
  generateKeyPair,
  presentCredential,
  stubAssertionVerifier,
  type DeviceAssertion,
  type ResidencyFacts,
} from '@eas/shared';
import {
  checkCredentialLayer,
  createProxyingMonitor,
  type IdentityBindingCheck,
} from '@eas/agents';
import { setupIssuerWorld } from './helpers/vleiWorld.js';

const WORKER_DID = 'did:key:zWorker001';
const DEVICE = 'webauthn:cred-0417';
const NOW = new Date('2026-09-01T00:00:00Z');

const RESIDENCY: ResidencyFacts = {
  identityAnchor: 'sha256:synthetic-anchor-0417',
  holderDid: WORKER_DID,
  deviceCredentialId: DEVICE,
  permitValidUntil: '2029-07-31',
};

const PRESENT_ASSERTION: DeviceAssertion = {
  credentialId: DEVICE,
  challenge: 'synthetic-challenge-01',
  userVerified: true,
  signature: 'synthetic-authenticator-signature',
};

/** The browser hands this to WebAuthn; a test hands it a synthetic stand-in. */
const acceptAssertion = () => true;

async function presentWith(assertion: DeviceAssertion | undefined) {
  const world = await setupIssuerWorld({});
  const worker = await generateKeyPair();
  const credential = await world.issuer.issue('WorkingHoursCredential', {
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
    ...(assertion === undefined ? {} : { deviceAssertion: assertion }),
  });

  return {
    issuerKey: world.issuerKey,
    worker,
    attestation,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
  };
}

const gate = (
  p: Awaited<ReturnType<typeof presentWith>>,
  identity: IdentityBindingCheck | undefined,
) =>
  checkCredentialLayer({
    presentation: p.presentation,
    attestation: p.attestation,
    issuerPublicKey: p.issuerKey,
    workerPublicKey: p.worker.publicKey,
    requiredClaims: ['withinRBALimit'],
    ...(identity === undefined ? {} : { identity }),
  });

describe('L1 — identity binding and device presence (題05 Q1/Q2)', () => {
  test('a wallet bound to the anchor, signing on its enrolled device, is admitted', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);
    const p = await presentWith(PRESENT_ASSERTION);

    const decision = await gate(p, { enrollments, at: NOW, verifyAssertion: acceptAssertion });

    expect(decision.ok).toBe(true);
  });

  test('a second wallet for the same person is refused at enrolment', async () => {
    // The broker case: the worker already has a wallet, and a second one is
    // being enrolled against the same identity anchor.
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);

    const second = enrollments.enroll({ ...RESIDENCY, holderDid: 'did:key:zBrokerWallet' });

    expect(second).toEqual({ ok: false, reason: 'IDENTITY_ALREADY_ENROLLED' });
  });

  test('re-enrolling the same wallet is idempotent rather than a conflict', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);

    expect(enrollments.enroll(RESIDENCY)).toEqual({ ok: true });
    expect(enrollments.bindingCountFor(RESIDENCY.identityAnchor)).toBe(1);
  });

  test('a wallet that was never enrolled cannot answer for a person', async () => {
    const enrollments = createEnrollmentRegistry();
    const p = await presentWith(PRESENT_ASSERTION);

    const decision = await gate(p, { enrollments, at: NOW, verifyAssertion: acceptAssertion });

    expect(decision.ok === false && decision.reason).toBe('WORKER_IDENTITY_UNBOUND');
  });

  test('a superseded wallet stops answering the moment it is revoked', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);
    enrollments.revoke(WORKER_DID);
    const p = await presentWith(PRESENT_ASSERTION);

    const decision = await gate(p, { enrollments, at: NOW, verifyAssertion: acceptAssertion });

    expect(decision.ok === false && decision.reason).toBe('WORKER_IDENTITY_UNBOUND');
  });

  test('re-binding after a lost device requires revoking first, and leaves a trace', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);
    enrollments.revoke(WORKER_DID);

    const rebound = enrollments.enroll({
      ...RESIDENCY,
      holderDid: 'did:key:zWorker001Replacement',
      deviceCredentialId: 'webauthn:cred-0417-new',
    });

    expect(rebound).toEqual({ ok: true });
    expect(enrollments.bindingCountFor(RESIDENCY.identityAnchor)).toBe(2);
  });

  test('an expired permit is reported as expired, not as an absent binding', async () => {
    // The two mean different things to a reviewer: one is "we have never seen
    // this wallet", the other is "this person's permission to be here ended".
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll({ ...RESIDENCY, permitValidUntil: '2026-08-31' });
    const p = await presentWith(PRESENT_ASSERTION);

    const decision = await gate(p, { enrollments, at: NOW, verifyAssertion: acceptAssertion });

    expect(decision.ok === false && decision.reason).toBe('RESIDENCY_PERMIT_EXPIRED');
  });

  test('a permit is valid through the whole of its final day', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll({ ...RESIDENCY, permitValidUntil: '2026-09-01' });

    expect(enrollments.statusOf(WORKER_DID, NOW)).toBe('ACTIVE');
  });

  test('a counter-signature with no device assertion cannot establish presence', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);
    const p = await presentWith(undefined);

    const decision = await gate(p, { enrollments, at: NOW, verifyAssertion: acceptAssertion });

    expect(decision.ok === false && decision.reason).toBe('USER_PRESENCE_NOT_VERIFIED');
  });

  test('an assertion from a device other than the enrolled one is refused', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);
    const p = await presentWith({ ...PRESENT_ASSERTION, credentialId: 'webauthn:some-other' });

    const decision = await gate(p, { enrollments, at: NOW, verifyAssertion: acceptAssertion });

    expect(decision.ok === false && decision.reason).toBe('DEVICE_CREDENTIAL_MISMATCH');
  });

  test('an authenticator that did not verify its user proves nothing', async () => {
    // The whole point: a key can sign in a pocket, a fingerprint cannot.
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);
    const p = await presentWith({ ...PRESENT_ASSERTION, userVerified: false });

    const decision = await gate(p, { enrollments, at: NOW, verifyAssertion: acceptAssertion });

    expect(decision.ok === false && decision.reason).toBe('USER_PRESENCE_NOT_VERIFIED');
  });

  test('a verifier with no way to check an authenticator refuses rather than assumes', async () => {
    const enrollments = createEnrollmentRegistry();
    enrollments.enroll(RESIDENCY);
    const p = await presentWith(PRESENT_ASSERTION);

    const decision = await gate(p, {
      enrollments,
      at: NOW,
      verifyAssertion: stubAssertionVerifier,
    });

    expect(decision.ok === false && decision.reason).toBe('USER_PRESENCE_NOT_VERIFIED');
  });

  test('a verifier that does not ask about identity is unaffected by any of this', async () => {
    // An RBA compliance query has no business knowing which wallet answered.
    const p = await presentWith(undefined);

    const decision = await gate(p, undefined);

    expect(decision.ok).toBe(true);
  });

  test('one device counter-signing for many workers is flagged, without naming them', async () => {
    const monitor = createProxyingMonitor();
    const broker = 'sha256:synthetic-device-broker';

    monitor.record(broker, 'did:key:zWorker001');
    monitor.record(broker, 'did:key:zWorker002');
    monitor.record(broker, 'did:key:zWorker003');
    monitor.record(broker, 'did:key:zWorker004');

    const risk = monitor.risk(broker);

    expect(risk).toEqual({ workerCount: 4, flagged: true });
    expect(Object.values(risk).some((value) => typeof value === 'string')).toBe(false);
  });

  test('a worker signing repeatedly on their own device is never flagged', async () => {
    const monitor = createProxyingMonitor();
    const own = 'sha256:synthetic-device-001';

    monitor.record(own, WORKER_DID);
    monitor.record(own, WORKER_DID);
    monitor.record(own, WORKER_DID);
    monitor.record(own, WORKER_DID);

    expect(monitor.risk(own)).toEqual({ workerCount: 1, flagged: false });
  });
});
