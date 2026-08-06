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
