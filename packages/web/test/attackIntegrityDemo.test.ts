import { describe, expect, test } from 'vitest';
import { K_ANONYMITY } from '@eas/shared';
import { createDemoWorld } from '@eas/web';

describe('demo world — attack & integrity panels', () => {
  test('T8: an injected instruction is accepted as data but does not flip the verdict', async () => {
    const world = await createDemoWorld();

    const attack = world.attackDemo();

    expect(attack.t8.injectedRemark).toContain('SYSTEM');
    expect(attack.t8.accepted).toBe(true);
    // The record was non-compliant and stays non-compliant despite "mark as PASSED".
    expect(attack.t8.withinRBALimit).toBe(false);
  });

  test('T9: two broad queries are answered and the narrowing third is denied', async () => {
    const world = await createDemoWorld();

    const { steps } = world.attackDemo().t9;

    expect(steps).toHaveLength(4);
    expect(steps[0]?.ok).toBe(true);
    expect(steps[1]?.ok).toBe(true);
    expect(steps[2]?.ok).toBe(false);
    expect(steps[2]?.reason).toBe('DIFFERENCING_ATTACK_DETECTED');
    // The fourth is the legitimate case the guard used to refuse: a provably
    // non-overlapping period whose roster barely changed. Answering it is the
    // continuous monitoring this system is for; refusing it protected nobody.
    expect(steps[3]?.ok).toBe(true);
    // The explanation names the difference and the bar it fell under, so a
    // viewer can see why the third query was the dangerous one.
    expect(steps[2]?.explanation).toContain('母體差');
    expect(steps[2]?.explanation).toContain(String(K_ANONYMITY.rate));
    expect(typeof steps[2]?.auditRef).toBe('number');
  });

  /**
   * The panel prints each step's cohort size and the gap between the broad and
   * the narrowing query. Those numbers used to be literals typed beside the
   * labels, and they drifted from the queries they described — the screen said
   * 15 where the roster was 30. A demo that misstates its own numbers loses the
   * argument it exists to make, so the sizes are now measured, and this is the
   * test that keeps them measured.
   */
  test('T9: the printed cohort sizes are the sizes the queries actually used', async () => {
    const world = await createDemoWorld();

    const { steps, overlapGap } = world.attackDemo().t9;

    expect(steps.map((s) => s.cohortSize)).toEqual([30, 30, 25, 29]);
    // Every answered query must clear the bar it is printed next to.
    for (const step of steps.filter((s) => s.ok)) {
      expect(step.cohortSize).toBeGreaterThanOrEqual(K_ANONYMITY.rate);
    }
    // The gap the guard refuses is the difference the panel names, and it is
    // below k — that is the whole reason the third query is denied.
    expect(overlapGap).toBe((steps[0]?.cohortSize ?? 0) - (steps[2]?.cohortSize ?? 0));
    expect(overlapGap).toBeLessThan(K_ANONYMITY.rate);
  });

  test('P6: the evidence integrity index composes three signals into a graded score', async () => {
    const world = await createDemoWorld();

    const integrity = world.integrityDemo();

    expect(integrity.index).toBeGreaterThan(0);
    expect(integrity.index).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D']).toContain(integrity.grade);
    expect(integrity.components.coverage).toBeCloseTo(0.8);
    expect(integrity.components.consistency).toBeCloseTo(0.8);
  });
});
