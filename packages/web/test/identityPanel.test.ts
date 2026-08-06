import { describe, expect, test } from 'vitest';
import { createDemoWorld } from '@eas/web';

describe('demo world — identity binding panel', () => {
  test('the worker starts bound to their anchor, with one wallet in their history', async () => {
    const world = await createDemoWorld();

    const identity = world.identityState();

    expect(identity.status).toBe('ACTIVE');
    expect(identity.bindingCount).toBe(1);
    expect(identity.brokerAttempt).toBeNull();
  });

  test('a broker enrolling a second wallet is refused, and nothing moves', async () => {
    const world = await createDemoWorld();

    world.attemptBrokerWallet();
    const identity = world.identityState();

    expect(identity.brokerAttempt).toBe('IDENTITY_ALREADY_ENROLLED');
    expect(identity.status).toBe('ACTIVE');
    expect(identity.bindingCount).toBe(1);
    expect(identity.holderDid).toBe('did:key:zWorker001');
  });

  test('the panel reports the identity anchor and never the reference behind it', async () => {
    // The anchor is public because uniqueness has to be checkable. What must
    // never be here is the residency reference the anchor was derived from.
    const world = await createDemoWorld();

    const identity = world.identityState();

    expect(identity.identityAnchor.startsWith('sha256:')).toBe(true);
    expect(JSON.stringify(identity)).not.toContain('arc-reference');
    expect(JSON.stringify(identity)).not.toContain('anchor-salt');
  });
});

describe('demo world — the audit trail verifies against the chain (題06 Q4)', () => {
  test('a challenger can re-derive the whole trail using only the chain key', async () => {
    const world = await createDemoWorld();
    await world.attestAll();
    await world.split();

    const verdict = await world.auditIntegrity();

    expect(verdict.ok).toBe(true);
    expect(verdict.ok === true && verdict.sealed).toBe(true);
    expect(verdict.ok === true && verdict.verifiedEntries).toBeGreaterThan(0);
  });
});

describe('demo world — the governance chain panel (題06 Q1／Q4)', () => {
  test('the working-hours issuer reports the tier its chain grants', async () => {
    const world = await createDemoWorld();

    const governance = await world.governanceState();

    expect(governance.workingHoursChainTier).toBe('SELF_DECLARED');
  });

  test('striking off the audit body drops its endorsement, without touching anything else', async () => {
    const world = await createDemoWorld();
    expect((await world.governanceState()).auditor.legalName).toBe('SGS 稽核（合成）');

    world.revokeAuditor();
    const after = await world.governanceState();

    expect(after.auditor.legalName).toBeNull();
    // The reviewer is a different office under a different entity: revoking an
    // auditor must not quietly take anyone else down with it.
    expect(after.reviewer.personLegalName).not.toBeNull();
  });

  test('a reviewer who leaves can approve nothing further', async () => {
    const world = await createDemoWorld();
    expect((await world.governanceState()).reviewer.personLegalName).toBe('王小明（合成）');

    world.revokeReviewer();

    expect((await world.governanceState()).reviewer.personLegalName).toBeNull();
  });

  test('the panel reports the trail as a challenger would see it, sealed', async () => {
    const world = await createDemoWorld();
    await world.attestAll();
    await world.split();

    const governance = await world.governanceState();

    expect(governance.auditIntegrity.ok).toBe(true);
    expect(governance.auditIntegrity.sealed).toBe(true);
    expect(governance.auditIntegrity.verifiedEntries).toBeGreaterThan(0);
  });
})
