import { describe, expect, test } from 'vitest';
import { poseidonCommit, randomSalt } from '@eas/shared';

describe('poseidon commitment', () => {
  test('the same inputs always commit to the same value', async () => {
    const a = await poseidonCommit([186n, 42n, 12345n]);
    const b = await poseidonCommit([186n, 42n, 12345n]);

    expect(a).toBe(b);
    // Pinned against the circuit: circomlib's Poseidon(3) over the same inputs.
    // If this changes, the JS side and the circuit have diverged and every
    // proof will fail to verify. The fix is never to update this number alone.
    expect(a).toBe(
      '9004221170960342108411548874718178450489702326188007106947769597241530808458',
    );
  });

  test('changing any input changes the commitment', async () => {
    const base = await poseidonCommit([186n, 42n, 12345n]);

    expect(await poseidonCommit([150n, 42n, 12345n])).not.toBe(base);
    expect(await poseidonCommit([186n, 10n, 12345n])).not.toBe(base);
    expect(await poseidonCommit([186n, 42n, 99999n])).not.toBe(base);
  });

  test('salts do not repeat', () => {
    const salts = new Set(Array.from({ length: 64 }, () => randomSalt()));

    expect(salts.size).toBe(64);
  });
});
