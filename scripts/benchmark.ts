/**
 * What the guarantees cost.
 *
 * Every claim this project makes about privacy is paid for in signatures,
 * chain walks and, in one place, a zero-knowledge proof. A reviewer asking
 * "could a bank actually run this?" is asking for these numbers, and the
 * honest answer has to be measured rather than estimated.
 *
 * Run: `npm run bench`. It writes a markdown table to stdout; the numbers in
 * docs/performance.md are its output, with the machine it ran on recorded
 * alongside them, because a latency without a machine is not a measurement.
 *
 * The synthetic demo world is the subject deliberately: it is the same code
 * path the live site and the tests exercise, so these are the costs of the
 * real thing rather than of a benchmark-shaped imitation.
 */

import { cpus, totalmem } from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { groth16 } from 'snarkjs';
import {
  createWorkerAttestation,
  generateKeyPair,
  poseidonCommit,
  presentCredential,
  verifyPresentation,
} from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { DEFAULT_RECONCILIATION_PARAMS } from '@eas/reconciliation';
import { createDemoWorld } from '../packages/web/src/demo/world.js';

interface Measurement {
  readonly what: string;
  readonly medianMs: number;
  readonly runs: number;
  readonly note: string;
}

const measurements: Measurement[] = [];

/**
 * Median rather than mean: one garbage collection pause should not become the
 * number a judge reads off a slide. Runs are sequential and the timer starts
 * after any warm-up the caller did, so what is reported is steady-state cost.
 */
async function measure(
  what: string,
  runs: number,
  note: string,
  body: () => Promise<unknown>,
): Promise<void> {
  const samples: number[] = [];

  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    await body();
    samples.push(performance.now() - started);
  }

  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] ?? 0;
  measurements.push({ what, medianMs: median, runs, note });
  // Progress goes to stderr so that stdout stays a clean markdown table, and
  // so that a run that stalls says where rather than sitting silent.
  process.stderr.write(`  ${what}: ${median.toFixed(1)} ms (${runs} runs)\n`);
}

function ms(value: number): string {
  return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(1)} ms`;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

async function main(): Promise<void> {
  // Poseidon's first build is a one-off two seconds that belongs to nobody's
  // latency. Paying it here keeps it out of every number below.
  await poseidonCommit([1n, 2n]);

  // ---- the demo world: bootstrap, counter-signature, both agents ----------

  await measure(
    'vLEI 生態系啟動 ＋ 四張憑證簽發 ＋ 六人母體',
    3,
    'createDemoWorld()：GLEIF 2-of-3 根、QVI、四家法人、Agent ECR、SD-JWT 簽發',
    async () => {
      await createDemoWorld();
    },
  );

  const world = await createDemoWorld();

  await measure('勞工反簽四張憑證', 5, 'attestAll()：四次 ES256 簽章＋雜湊綁定', async () => {
    await world.attestAll();
  });

  await world.attestAll();

  await measure(
    '錢包端檢視 Agent 授權（L0）',
    10,
    'delegationState()：驗 DelegationCredential ＋ 走完 ECR vLEI 鏈',
    async () => {
      await world.delegationState();
    },
  );

  await measure(
    '兩家機構各問一次，走完 L0→L1→L2',
    5,
    'split()：銀行建議 ＋ 品牌合規率，含六人母體的 k-匿名檢查',
    async () => {
      await world.split();
    },
  );

  await measure(
    '簽發查驗收據並獨立重驗簽章',
    5,
    'receipts()：收據簽發後以查驗方公鑰重新驗簽',
    async () => {
      await world.receipts();
    },
  );

  // ---- one credential, end to end, for size as well as time --------------

  const worker = await generateKeyPair();
  const issuer = await createIssuer('did:web:factory.example', { tier: 'THIRD_PARTY_VERIFIED' });
  const credential = await issuer.issue('WorkingHoursCredential', {
    workerDID: 'did:key:zWorker001',
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
  });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    credential,
    workerDID: 'did:key:zWorker001',
    deviceFingerprint: 'sha256:synthetic-device-001',
  });
  const presentation = await presentCredential(credential, ['withinRBALimit']);

  await measure('簽發一張憑證', 10, 'issue()：ES256 ＋ 選擇性揭露封裝 ＋ Poseidon 承諾', async () => {
    await issuer.issue('WorkingHoursCredential', {
      workerDID: 'did:key:zWorker001',
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
    });
  });

  await measure('出示一張憑證（只揭露結論）', 10, 'presentCredential()', async () => {
    await presentCredential(credential, ['withinRBALimit']);
  });

  await measure('驗證一張出示（含未揭露欄位檢查）', 10, 'verifyPresentation()', async () => {
    await verifyPresentation(presentation, issuer.publicKey);
  });

  // ---- the proof ---------------------------------------------------------

  const build = fileURLToPath(new URL('../circuits/build/', import.meta.url));
  const wasm = join(build, 'reconciliation_js', 'reconciliation.wasm');
  const zkey = join(build, 'reconciliation.zkey');
  const vkeyPath = join(build, 'verification_key.json');
  const circuitBuilt = existsSync(wasm) && existsSync(zkey) && existsSync(vkeyPath);

  let proofBytes = 0;

  if (circuitBuilt) {
    const hoursSalt = 111n;
    const salarySalt = 222n;
    const input = {
      totalHours: 186,
      overtimeHours: 42,
      hoursSalt: hoursSalt.toString(),
      deposit: 38000,
      salarySalt: salarySalt.toString(),
      hoursCommitment: await poseidonCommit([186n, 42n, hoursSalt]),
      salaryCommitment: await poseidonCommit([38000n, salarySalt]),
      legalWageRate: DEFAULT_RECONCILIATION_PARAMS.legalWageRate,
      overtimeMultiplierBps: Math.round(DEFAULT_RECONCILIATION_PARAMS.overtimeMultiplier * 10000),
      toleranceBps: DEFAULT_RECONCILIATION_PARAMS.toleranceBps,
    };

    const first = await groth16.fullProve(input, wasm, zkey);
    const vkey: unknown = JSON.parse(readFileSync(vkeyPath, 'utf8'));
    proofBytes = Buffer.byteLength(JSON.stringify(first.proof), 'utf8');

    await measure(
      '產生對帳零知識證明',
      5,
      'groth16.fullProve()：witness 計算 ＋ 證明產生（Node）',
      async () => {
        await groth16.fullProve(input, wasm, zkey);
      },
    );

    await measure('驗證對帳零知識證明', 10, 'groth16.verify()', async () => {
      await groth16.verify(vkey, first.publicSignals, first.proof);
    });
  }

  // ---- report ------------------------------------------------------------

  const cpu = cpus()[0]?.model.trim() ?? 'unknown CPU';
  const lines: string[] = [];

  lines.push(`量測機器：${cpu}，${cpus().length} 執行緒，${Math.round(totalmem() / 1024 ** 3)} GB RAM`);
  lines.push(`Node ${process.version}，${process.platform}`);
  lines.push('');
  lines.push('| 動作 | 中位數 | 取樣 | 內容 |');
  lines.push('|---|---:|---:|---|');

  for (const m of measurements) {
    lines.push(`| ${m.what} | ${ms(m.medianMs)} | ${m.runs} | ${m.note} |`);
  }

  lines.push('');
  lines.push('| 產出物 | 大小 |');
  lines.push('|---|---:|');
  lines.push(`| 一張憑證（SD-JWT，含全部隱藏欄位） | ${kb(Buffer.byteLength(credential, 'utf8'))} |`);
  lines.push(`| 勞工反簽 attestation | ${kb(Buffer.byteLength(attestation, 'utf8'))} |`);
  lines.push(`| 一次出示（只揭露一個結論） | ${kb(Buffer.byteLength(presentation, 'utf8'))} |`);

  if (circuitBuilt) {
    lines.push(`| 零知識證明本體 | ${kb(proofBytes)} |`);
    lines.push(`| 電路 witness 計算器 reconciliation.wasm | ${kb(statSync(wasm).size)} |`);
    lines.push(`| 證明金鑰 reconciliation.zkey | ${kb(statSync(zkey).size)} |`);
    lines.push(`| 驗證金鑰 verification_key.json | ${kb(statSync(vkeyPath).size)} |`);
  } else {
    lines.push('');
    lines.push('電路產出物不在本機，證明相關數字已略過（`npm run build:circuit` 可重建）。');
  }

  console.log(lines.join('\n'));

  // snarkjs starts worker threads for the bn128 curve and never stops them, so
  // without this the table prints and the process then hangs indefinitely.
  const withCurve = globalThis as { curve_bn128?: { terminate(): Promise<void> } };
  await withCurve.curve_bn128?.terminate();
}

await main();
