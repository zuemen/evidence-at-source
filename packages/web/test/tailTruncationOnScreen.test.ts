import { describe, expect, test } from 'vitest';
import { createDemoWorld } from '../src/demo/world.js';

/**
 * The console now claims on screen that a truncated trail passes chain
 * verification and fails a checkpoint. Both halves have to be true, and the
 * first half is the one worth guarding: a demo that showed the checkpoint
 * catching something the chain also caught would be demonstrating nothing.
 */

describe('the tail-truncation panel shows a gap the chain genuinely cannot close', () => {
  test('the truncated trail still verifies as a chain', async () => {
    const world = await createDemoWorld();
    // The trail is written by queries; the real payload runs split() before it
    // reads governance state, and a demonstration on an empty trail is no
    // demonstration at all.
    await world.split();
    const { tailTruncation } = await world.governanceState();

    expect(tailTruncation.chainStillVerifies).toBe(true);
    expect(tailTruncation.truncatedTo).toBe(tailTruncation.anchoredAt - 1);
  });

  test('the checkpoint contradicts it', async () => {
    const world = await createDemoWorld();
    // The trail is written by queries; the real payload runs split() before it
    // reads governance state, and a demonstration on an empty trail is no
    // demonstration at all.
    await world.split();
    const { tailTruncation } = await world.governanceState();

    expect(tailTruncation.anchorFailure).toBe('TAIL_TRUNCATED');
  });

  test('the trail is long enough for the demonstration to mean something', async () => {
    // A one-entry trail truncated to zero would satisfy both assertions above
    // while showing the viewer nothing.
    const world = await createDemoWorld();
    // The trail is written by queries; the real payload runs split() before it
    // reads governance state, and a demonstration on an empty trail is no
    // demonstration at all.
    await world.split();
    const { tailTruncation } = await world.governanceState();

    expect(tailTruncation.anchoredAt).toBeGreaterThan(1);
  });
});
