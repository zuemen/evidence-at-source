import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Workspace packages are resolved straight to TypeScript sources so that
      // tests always exercise the code under edit, with no build step.
      '@eas/shared': r('./packages/shared/src/index.ts'),
      '@eas/issuer': r('./packages/issuer/src/index.ts'),
    },
  },
  test: {
    // poc/ is standalone demo evidence and is deliberately excluded.
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
