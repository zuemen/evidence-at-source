import { describe, expect, test } from 'vitest';
import { createDemoWorld } from '../src/demo/world.js';

/**
 * The tamper demo re-issues the working-hours credential with 186 rewritten
 * to 150 while the worker's counter-signature still points at the original.
 * The new signature is genuine — that is the point. What must catch it is the
 * pairing, and what the screen claims is that the brand's cohort gate throws
 * the tampered submission out with a named reason.
 */

describe('re-signing after the counter-signature is caught by the pairing, not the signature', () => {
  test('the tampered submission is rejected from the cohort with ATTESTATION_HASH_MISMATCH', async () => {
    const world = await createDemoWorld();
    await world.attestAll();
    await world.tamperWorkingHours();

    const { brand } = await world.split();

    expect(brand.rejected).toContain('ATTESTATION_HASH_MISMATCH');
  });

  test('before tampering, nothing is rejected — the demo shows a change, not a constant', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    const { brand } = await world.split();

    expect(brand.rejected).not.toContain('ATTESTATION_HASH_MISMATCH');
  });

  test('the wallet card says so, in the state the worker would see', async () => {
    const world = await createDemoWorld();
    await world.attestAll();
    await world.tamperWorkingHours();

    const card = world
      .snapshot()
      .credentials.find((c) => c.type === 'WorkingHoursCredential');

    expect(card?.tampered).toBe(true);
  });
});
