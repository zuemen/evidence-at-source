/**
 * Rebuilds the proving and verifying material from source.
 *
 * Powers of tau is generated locally rather than downloaded: the circuit is
 * small enough that a 2^12 ceremony takes seconds, and one fewer external
 * artifact is one fewer thing a reviewer has to trust. This is a demo-grade
 * setup — a production deployment needs a real multi-party ceremony, and
 * circuits/README.md says so plainly.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, 'build');
const circom = process.env['CIRCOM'] ?? 'circom';

// shell:true is needed on Windows to resolve npx, but it also means arguments
// are not quoted for us — every argument below must therefore be free of
// spaces, or it will be split into several.
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: here, stdio: 'inherit', shell: process.platform === 'win32' });

const snarkjs = (...args) => run('npx', ['snarkjs', ...args]);

mkdirSync(build, { recursive: true });

run(circom, [
  'reconciliation.circom',
  '--r1cs',
  '--wasm',
  '-l',
  join(here, '..', 'node_modules'),
  '-o',
  build,
]);

const pot = join(build, 'pot12_final.ptau');

// 2^12: the circuit has ~1300 constraints and snarkjs needs 2 * constraints.
// 2^8 fails with "circuit too big for this power of tau ceremony".
if (!existsSync(pot)) {
  snarkjs('powersoftau', 'new', 'bn128', '12', join(build, 'pot12_0.ptau'));
  snarkjs(
    'powersoftau',
    'contribute',
    join(build, 'pot12_0.ptau'),
    join(build, 'pot12_1.ptau'),
    '--name=demo',
    '-e=synthetic-entropy-demo-grade',
  );
  snarkjs('powersoftau', 'prepare', 'phase2', join(build, 'pot12_1.ptau'), pot);
}

snarkjs(
  'groth16',
  'setup',
  join(build, 'reconciliation.r1cs'),
  pot,
  join(build, 'reconciliation_0.zkey'),
);
snarkjs(
  'zkey',
  'contribute',
  join(build, 'reconciliation_0.zkey'),
  join(build, 'reconciliation.zkey'),
  '--name=demo',
  '-e=more-synthetic-entropy',
);
snarkjs(
  'zkey',
  'export',
  'verificationkey',
  join(build, 'reconciliation.zkey'),
  join(build, 'verification_key.json'),
);

console.log('circuit build complete:', build);
