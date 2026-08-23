import { describe, expect, test } from 'vitest';
import { createDemoWorld } from '../src/demo/world.js';

/**
 * The demo now says something on screen about a language model, so the screen
 * has to be checked like anything else that makes a claim.
 *
 * T8 used to demonstrate prompt injection against a system with no model in
 * it, which proved only that an absent attack surface cannot be attacked. The
 * panel now shows the model half: what the injected instruction made a model
 * write, and what stopped it reaching the reviewer. These tests pin the three
 * properties a viewer is being asked to believe.
 */

describe('the injection demo shows an attack that lands and a guard that holds', () => {
  test('the draft written under injection is rejected, and the reviewer sees the template', async () => {
    const world = await createDemoWorld();
    const { explain } = world.attackDemo().t8;

    // The attack lands: the model wrote the opposite verdict.
    expect(explain.modelDraft).toContain('建議核准');
    expect(explain.recommendation).toBe('DECLINE_PENDING_HUMAN_REVIEW');

    // The guard holds: the draft never reaches the reader.
    expect(explain.source).toBe('offline');
    expect(explain.shown).not.toContain('建議核准');
    expect(explain.shown).toContain('DECLINE_PENDING_HUMAN_REVIEW');
  });

  test('all three guard rules fire, so the panel is not showing one lucky catch', async () => {
    const world = await createDemoWorld();
    const { violations } = world.attackDemo().t8.explain;

    expect([...violations].sort()).toEqual([
      'CLAIMS_FINAL_DECISION',
      'CONTRADICTS_RECOMMENDATION',
      'REVEALS_UNDISCLOSED_VALUE',
    ]);
  });

  test('the figure from the untrusted remark does not survive into what is shown', async () => {
    // 150 is the overtime figure the injected remark carries. A reviewer must
    // not read it as though the system had disclosed it.
    const world = await createDemoWorld();
    const { explain } = world.attackDemo().t8;

    expect(explain.modelDraft).toContain('150');
    expect(explain.shown).not.toContain('150');
  });
});
