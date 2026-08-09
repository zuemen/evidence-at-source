import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Workspace packages are resolved straight to TypeScript sources so that
      // tests always exercise the code under edit, with no build step.
      '@eas/shared': r('./packages/shared/src/index.ts'),
      '@eas/vlei': r('./packages/vlei/src/index.ts'),
      '@eas/issuer': r('./packages/issuer/src/index.ts'),
      '@eas/agents': r('./packages/agents/src/index.ts'),
      '@eas/reconciliation': r('./packages/reconciliation/src/index.ts'),
      '@eas/adapters': r('./packages/adapters/src/index.ts'),
      '@eas/explain': r('./packages/explain/src/index.ts'),
      '@eas/integrity': r('./packages/integrity/src/index.ts'),
      '@eas/web': r('./packages/web/src/demo/world.ts'),
    },
  },
  test: {
    // poc/ is standalone demo evidence and is deliberately excluded.
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // circomlibjs takes roughly two seconds to import and build Poseidon, and
    // vitest gives every test file its own module registry, so each file that
    // issues a credential pays that cost again — charged to whichever test in
    // it happens to run first. Against the 5 s default that lands on the wrong
    // side of the line on a loaded machine, and the failure looks like a flaky
    // test rather than the one-off module initialisation it is. Nothing here
    // should legitimately take twenty seconds; this is headroom, not patience.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Two workers, regardless of how many cores are available.
    //
    // These tests do real cryptography — ed25519 keygen, a multisig vLEI
    // ecosystem, KEL anchoring, a Poseidon commitment per credential — and a
    // file that takes four seconds alone takes twenty when ten of its siblings
    // are competing for the same cores. The whole suite went red at full
    // parallelism while every file passed on its own.
    //
    // `isolate: false` was tried first, on the theory that the cost was
    // per-file module initialisation. It changed nothing: the work is the
    // crypto, not the imports. So the fix is fewer workers rather than a
    // larger timeout — a timeout raised until the contention fits underneath
    // it hides the problem instead of bounding it, and the next few test files
    // would put it right back.
    //
    // Which is exactly what happened. Four workers held at 413 tests and went
    // red at 449, with the two vLEI world-building files timing out under
    // contention and passing on their own. The prediction in the paragraph
    // above was about a raised timeout, and it applies to a worker count set
    // just high enough to fit today's suite too — so the number moved to the
    // one that has real headroom rather than to the next one that barely fits.
    // The right permanent fix is for the demo fixtures to stop rebuilding a
    // whole vLEI ecosystem per file; until then this bounds the damage.
    maxWorkers: 2,
  },
});
