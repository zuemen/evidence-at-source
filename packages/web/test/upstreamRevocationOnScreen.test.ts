import { describe, expect, test } from 'vitest';
import { createDemoWorld } from '../src/demo/world.js';

/**
 * GLEIF revoking the QVI must reach the screen.
 *
 * `requireIssuerSigningKey` throws by design, and the console used to let that
 * throw escape: pressing the button revoked the credential, the payload
 * refresh died inside `split()`, and the panel stayed green. The demo's most
 * quotable property — revoke upstream and everything beneath fails at the next
 * query — was the one thing a judge pressing the button could not see.
 *
 * So the guard is on the state, not on the rendering: after revocation every
 * piece the console renders still has to resolve, and both agents have to come
 * back refused with the code the gate actually produced.
 */
describe('upstream revocation cascades into the console instead of crashing it', () => {
  test('both agents refuse at L0 once the QVI they hang off is revoked', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    const before = await world.split();
    expect(before.bank.refusedWith).toBeNull();

    world.revokeQvi();

    // L0 gets there first: the agent's own ECR chain hangs off the same QVI,
    // so the gate refuses before a single worker field is read. That is a
    // stronger property than refusing at the issuer layer, and it is the one
    // the console must show.
    const after = await world.split();
    expect(after.bank.refusedWith).toBe('AGENT_VLEI_REVOKED');
    expect(after.brand.refusedWith).toBe('AGENT_VLEI_REVOKED');
    expect(Object.keys(after.bank.disclosed)).toHaveLength(0);
    expect(after.brand.answer).toBeNull();
  });

  /**
   * The whole payload has to survive, not just the split.
   *
   * `governanceState` verified the audit seals with a key it demanded through
   * the throwing resolver, so revoking the QVI killed the refresh and left the
   * panel frozen on stale green. Every piece the console renders is probed
   * here for that reason.
   */
  test('every payload piece still resolves after the QVI is revoked', async () => {
    const world = await createDemoWorld();
    await world.attestAll();
    world.revokeQvi();

    await expect(world.governanceState()).resolves.toBeDefined();
    await expect(world.split()).resolves.toBeDefined();
    await expect(world.delegationState()).resolves.toBeDefined();
    await expect(world.receipts()).resolves.toBeDefined();
    expect(world.vleiState()).toBeDefined();
    expect(world.identityState()).toBeDefined();
  });

  test('the trust-chain panel reports the same failure it renders', async () => {
    const world = await createDemoWorld();
    world.revokeQvi();

    const vlei = world.vleiState();

    expect(vlei.qviRevoked).toBe(true);
    expect(vlei.chains.every((chain) => !chain.verified)).toBe(true);
    expect(vlei.chains.every((chain) => chain.failure === 'REGISTRY_REVOKED')).toBe(true);
    expect(vlei.issuers.every((issuer) => !issuer.verified)).toBe(true);
  });
});
