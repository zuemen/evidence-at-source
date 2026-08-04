import { describe, expect, test } from 'vitest';
import { runVleiDemo } from '../demo/vleiCascade.js';

describe('judge-facing vLEI demo', () => {
  test('every step passes', () => {
    const report = runVleiDemo();

    for (const step of report.steps) {
      expect(step.pass, `${step.label}: got ${step.actual}, want ${step.expected}`).toBe(true);
    }
    expect(report.allPass).toBe(true);
  });

  test('the demo covers issuance, tampering, revocation and the QVI cascade', () => {
    const labels = runVleiDemo()
      .steps.map((step) => step.label)
      .join('|');

    expect(runVleiDemo().steps.length).toBeGreaterThanOrEqual(10);
    expect(labels).toContain('LEI');
    expect(labels).toContain('竄改');
    expect(labels).toContain('ECR 撤銷');
    expect(labels).toContain('QVI 撤銷');
    expect(labels).toContain('外來信任根');
  });
});
