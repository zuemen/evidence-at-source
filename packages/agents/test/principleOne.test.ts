import { describe, expect, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Principle 1 of CLAUDE.md, enforced instead of merely documented.
 *
 * These capabilities must not exist in the codebase at all — not guarded by a
 * condition, not thrown from, not commented out. If this test ever goes red,
 * the fix is to delete the code, never to relax the test.
 */
const FORBIDDEN_CAPABILITIES = [
  'approveAccount',
  'rejectAccount',
  'freezeAccount',
  'transferFunds',
  'readTransactionHistory',
] as const;

const PACKAGES_DIR = fileURLToPath(new URL('../../', import.meta.url));

async function collectSourceFiles(): Promise<string[]> {
  const entries = await readdir(PACKAGES_DIR, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes('node_modules') && !path.endsWith('principleOne.test.ts'));
}

describe('principle 1 — capabilities live in the tool list, not in a prompt', () => {
  test('no source file mentions a capability the agents must not have', async () => {
    const files = await collectSourceFiles();

    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const capability of FORBIDDEN_CAPABILITIES) {
        if (source.includes(capability)) {
          offenders.push(`${file} -> ${capability}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
