import { describe, expect, test } from 'vitest';
import { runVleiDemo } from '../demo/vleiCascade.js';

/**
 * A demo run builds a whole ecosystem with a 2-of-3 multisig root and anchors
 * every TEL event in a KEL, so it is genuinely several seconds of ed25519 and
 * blake3 work. These tests carry an explicit timeout rather than riding the 5s
 * default, where they sat right on the edge and failed under parallel load.
 */
const DEMO_TIMEOUT_MS = 30_000;

describe('judge-facing vLEI demo', () => {
  test(
    'every step passes',
    () => {
      const report = runVleiDemo();

      for (const step of report.steps) {
        expect(step.pass, `${step.label}: got ${step.actual}, want ${step.expected}`).toBe(true);
      }
      expect(report.allPass).toBe(true);
    },
    DEMO_TIMEOUT_MS,
  );

  test(
    'the demo covers issuance, tampering, revocation and the QVI cascade',
    () => {
      const report = runVleiDemo();
      const labels = report.steps.map((step) => step.label).join('|');

      expect(report.steps.length).toBeGreaterThanOrEqual(13);
      expect(labels).toContain('LEI');
      expect(labels).toContain('竄改');
      expect(labels).toContain('ECR 撤銷');
      expect(labels).toContain('QVI 撤銷');
      expect(labels).toContain('外來信任根');
      expect(labels).toContain('多簽');
      expect(labels).toContain('可攜出示包');
    },
    DEMO_TIMEOUT_MS,
  );
});
