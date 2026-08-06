/**
 * Copies the proving artifacts into public/ before dev or build.
 *
 * They are not committed here: circuits/build/ is the single source of truth,
 * and a second copy in version control could drift from the circuit it claims
 * to prove. Missing artifacts are not fatal — the console panel reports that
 * the prover is unavailable, which is the correct fail-closed behaviour.
 */

import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', '..', '..', 'circuits', 'build');
const to = join(here, '..', 'public', 'zk');

const FILES = [
  ['reconciliation_js/reconciliation.wasm', 'reconciliation.wasm'],
  ['reconciliation.zkey', 'reconciliation.zkey'],
  ['verification_key.json', 'verification_key.json'],
];

mkdirSync(to, { recursive: true });

let copied = 0;
for (const [src, dest] of FILES) {
  const source = join(from, src);
  if (!existsSync(source)) continue;
  copyFileSync(source, join(to, dest));
  copied += 1;
}

console.log(
  copied === FILES.length
    ? 'circuit artifacts copied into public/zk'
    : `circuit artifacts incomplete (${copied}/${FILES.length}) — run npm run build:circuit`,
);
