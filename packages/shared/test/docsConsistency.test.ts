import { describe, expect, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * The project's central claim is "don't believe anything we say — go verify".
 * A stale number in the README undermines that claim more than it would in an
 * ordinary project, so the documents' factual claims about this repository are
 * asserted here rather than trusted.
 *
 * When this test goes red, the fix is to correct the document, never to relax
 * the assertion.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Documents that make factual claims to an outside reader (judges included). */
const PUBLIC_DOCUMENTS = [
  'README.md',
  'docs/governance-memo.md',
  'packages/web/public/slides.html',
  // A required deliverable too, and the one that drifted unnoticed while the
  // other three were guarded — a judge hears this script, they do not read it.
  'docs/demo-video-script.md',
] as const;

/**
 * Counts declared test cases statically. No test file in this repo generates
 * cases dynamically or suppresses them, so the static count equals the number
 * vitest reports. The guard below fails loudly if that ever stops being true.
 *
 * Note: the guard's own pattern is written so that this comment does not match
 * it — spelling the dynamic forms out here would make the file flag itself.
 */
const TEST_CASE = /^[ \t]*(?:test|it)(?:\.\w+)?\(/gm;
const DYNAMIC_TEST = /(?:test|it|describe)\.(?:each|skip|todo|only)\b/;

async function collectTestFiles(): Promise<string[]> {
  const packagesDir = join(REPO_ROOT, 'packages');
  const entries = await readdir(packagesDir, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes('node_modules'));
}

async function countTestCases(): Promise<number> {
  const files = await collectTestFiles();
  let total = 0;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    expect(source, `${file} uses dynamic test generation; the static count is no longer exact`)
      .not.toMatch(DYNAMIC_TEST);
    total += source.match(TEST_CASE)?.length ?? 0;
  }

  return total;
}

/** "243 個測試" / "243 tests" — but never "26 個測試檔", which counts files. */
function claimedTestCaseCounts(text: string): number[] {
  const claims = [
    ...text.matchAll(/(\d+)\s*個測試(?!檔)/g),
    ...text.matchAll(/(\d+)\s+tests\b/g),
  ];
  return claims.map((match) => Number(match[1]));
}

/** "26 個測試檔" */
function claimedTestFileCounts(text: string): number[] {
  return [...text.matchAll(/(\d+)\s*個測試檔/g)].map((match) => Number(match[1]));
}

/**
 * Repository paths a reader can click or copy: markdown links, plus inline
 * code that looks like a path (a slash and a known extension). Bare filenames
 * used as link labels are excluded by the slash requirement.
 */
function referencedPaths(markdown: string): string[] {
  const paths = new Set<string>();

  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (target === undefined) continue;
    if (/^https?:/.test(target) || target.startsWith('#')) continue;
    paths.add(target);
  }

  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) {
    const candidate = match[1];
    if (candidate === undefined) continue;
    if (candidate.includes('/') && /\.(md|ts|tsx|mjs|yaml|json)$/.test(candidate)) {
      paths.add(candidate);
    }
  }

  return [...paths];
}

describe('public documents state only true things about this repository', () => {
  test('every stated test count matches the number of test cases that exist', async () => {
    const actual = await countTestCases();
    const claims: string[] = [];

    for (const document of PUBLIC_DOCUMENTS) {
      const text = await readFile(join(REPO_ROOT, document), 'utf8');
      for (const claimed of claimedTestCaseCounts(text)) {
        if (claimed !== actual) claims.push(`${document} claims ${claimed}, actual ${actual}`);
      }
    }

    expect(claims).toEqual([]);
  });

  test('every stated test-file count matches the files in packages/agents/test', async () => {
    const entries = await readdir(join(REPO_ROOT, 'packages/agents/test'), { withFileTypes: true });
    const actual = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts')).length;

    const claims: string[] = [];
    for (const document of PUBLIC_DOCUMENTS) {
      const text = await readFile(join(REPO_ROOT, document), 'utf8');
      for (const claimed of claimedTestFileCounts(text)) {
        if (claimed !== actual) claims.push(`${document} claims ${claimed} files, actual ${actual}`);
      }
    }

    expect(claims).toEqual([]);
  });

  test('every repository path the README points at resolves to a real file', async () => {
    const markdown = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
    const unresolved = referencedPaths(markdown).filter(
      (path) => !existsSync(join(REPO_ROOT, path.split('#')[0] ?? path)),
    );

    expect(unresolved).toEqual([]);
  });
});
