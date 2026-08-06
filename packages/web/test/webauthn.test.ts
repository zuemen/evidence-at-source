import { describe, expect, test } from 'vitest';
import { assertPresence, isWebAuthnAvailable, registerDevice } from '../src/wallet/webauthn.js';

/**
 * Node has no authenticator, which makes it the right place to assert the
 * behaviour that matters most: what happens when presence *cannot* be
 * established. Every path here must end in "not verified", never in a
 * plausible-looking assertion.
 */
describe('device presence fails closed when no authenticator exists', () => {
  test('availability is reported honestly rather than assumed', () => {
    expect(isWebAuthnAvailable()).toBe(false);
  });

  test('registration returns nothing instead of inventing a credential id', async () => {
    expect(await registerDevice('did:key:zWorker001')).toBeNull();
  });

  test('an assertion cannot be produced, so the gate has nothing to accept', async () => {
    expect(await assertPresence('webauthn:cred-0417')).toBeNull();
  });
});
