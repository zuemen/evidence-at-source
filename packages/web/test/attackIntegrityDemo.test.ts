import { describe, expect, test } from 'vitest';
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

    expect(steps).toHaveLength(3);
    expect(steps[0]?.ok).toBe(true);
    expect(steps[1]?.ok).toBe(true);
    expect(steps[2]?.ok).toBe(false);
    expect(steps[2]?.reason).toBe('DIFFERENCING_ATTACK_DETECTED');
    expect(steps[2]?.explanation).toContain('3');
    expect(typeof steps[2]?.auditRef).toBe('number');
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
