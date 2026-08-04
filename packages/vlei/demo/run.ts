/**
 * CLI entry: poc-style output for the vLEI demo. Exit code 0 only when every
 * step of the report passes, so CI or a judge can rely on it mechanically.
 */

import { runVleiDemo } from './vleiCascade.js';

const report = runVleiDemo();

console.log('vLEI 信任鏈展示 — GLEIF → QVI → Legal Entity → ECR\n');

for (const step of report.steps) {
  const mark = step.pass ? '✓' : '✗';
  const note = step.pass ? '' : ` ← 應為 ${step.expected}`;
  console.log(`${mark} ${step.label}:`, step.actual + note);
}

console.log(
  report.allPass
    ? '\n全部通過：信任鏈可驗證、可撤銷、上游撤銷即全鏈失效。'
    : '\n有步驟失敗，見上方標記。',
);

process.exitCode = report.allPass ? 0 : 1;
