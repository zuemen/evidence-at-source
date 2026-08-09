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
    // Half the cores, not all of them.
    //
    // Every test file that issues a credential pays the Poseidon build above,
    // and enough of them running at once turns a 4-second file into a
    // 20-second one — the whole suite went red at full parallelism while each
    // file passed alone. The tests are not slow; the machine was oversubscribed.
    // Capping workers keeps the result a property of the code rather than of
    // whatever else the machine happens to be doing.
    maxWorkers: '50%',
  },
});
