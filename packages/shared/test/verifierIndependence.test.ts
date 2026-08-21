/**
 * 驗證器不得相依於被驗證的東西。
 *
 * 這個 repo 其餘的每一項驗證，跑的都是我們自己的程式碼。一個嚴格的評審可以正確地說：
 * **「你的程式碼說你的程式碼是對的。」**
 *
 * `packages/verifier` 是跳出那個迴圈的東西——它從規格重寫，只用 `jose` 與
 * `@noble/hashes`，對 `@eas/*` 零相依。這個守門讓那句話維持為真：任何人往裡面加一行
 * `@eas/` 的 import，這個測試就轉紅。
 *
 * 比照 `principleOne.test.ts`：唯一可驗證的邊界，是「那個相依在程式碼裡不存在」。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const VERIFIER = fileURLToPath(new URL('../../verifier/', import.meta.url));

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (entry.endsWith('.js') || entry.endsWith('.ts')) found.push(full);
  }

  return found;
}

/** Module specifiers a file imports, static or dynamic. */
function importedModules(text: string): string[] {
  const specifiers: string[] = [];
  for (const quote of ["'", '"']) {
    let at = 0;
    for (;;) {
      const from = text.indexOf(`from ${quote}`, at);
      const dynamic = text.indexOf(`import(${quote}`, at);
      const next = from === -1 ? dynamic : dynamic === -1 ? from : Math.min(from, dynamic);
      if (next === -1) break;
      const start = text.indexOf(quote, next) + 1;
      const end = text.indexOf(quote, start);
      if (end === -1) break;
      specifiers.push(text.slice(start, end));
      at = end + 1;
    }
  }

  return specifiers;
}

/** Whether `name` appears as a whole identifier, not inside a longer one. */
function mentionsIdentifier(text: string, name: string): boolean {
  const isWordChar = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch);

  for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
    const before = at === 0 ? '' : text[at - 1] ?? '';
    const after = text[at + name.length] ?? '';
    if (!isWordChar(before) && !isWordChar(after)) return true;
  }

  return false;
}

const files = sourceFiles(VERIFIER);

describe('獨立驗證器對實作零相依', () => {
  test('the scan finds the verifier’s sources, so it cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(2);
  });

  test('no file in packages/verifier imports an @eas/ package', () => {
    const offenders: string[] = [];

    for (const file of files) {
      for (const specifier of importedModules(readFileSync(file, 'utf8'))) {
        // The package is *named* @eas/verifier; that is a name, not a
        // dependency. What must not exist is an import of another @eas/*.
        if (specifier.startsWith('@eas/')) offenders.push(`${file} → ${specifier}`);
      }
    }

    expect(
      offenders,
      'the independent verifier must not depend on the implementation it verifies',
    ).toEqual([]);
  });

  test('its declared dependencies are standard cryptography libraries only', () => {
    const manifest = JSON.parse(readFileSync(join(VERIFIER, 'package.json'), 'utf8'));
    const deps = Object.keys(manifest.dependencies ?? {});

    expect(deps.sort()).toEqual(['@noble/hashes', 'jose']);
    expect(Object.keys(manifest.devDependencies ?? {})).toEqual([]);
  });

  test('the verifier cannot issue anything', () => {
    // A verifier that could mint credentials would carry the trust surface of
    // the system it exists to audit from outside.
    //
    // Detected as capabilities rather than as substrings. The first version of
    // this test looked for the word "issue" and flagged `issuerPublicJwk` in
    // every file — a guard whose failure mode is crying wolf gets silenced.
    const SIGNING_CAPABLE = [
      'SignJWT',
      'CompactSign',
      'FlattenedSign',
      'GeneralSign',
      'generateKeyPair',
      'generateSecret',
      'exportJWK',
    ];
    const offenders: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const name of SIGNING_CAPABLE) {
        // Word boundaries by hand: `importJWK` must not trip on `exportJWK`,
        // and an escaped regex written through three layers of tooling is how
        // the first version of this check silently matched nothing at all.
        if (mentionsIdentifier(text, name)) {
          offenders.push(`${file} → ${name}`);
        }
      }
    }

    expect(offenders, 'the verifier must verify and never issue').toEqual([]);
  });

  test('the guard detects an @eas/ import when one is present', () => {
    // Self-test, so the guard cannot quietly stop working. The real files are
    // checked above; this checks the detector.
    expect(importedModules("import { x } from '@eas/shared';")).toEqual(['@eas/shared']);
    expect(importedModules("const m = await import('@eas/agents');")).toEqual(['@eas/agents']);
    expect(importedModules("import { verifyPairing } from 'jose';")).toEqual(['jose']);
  });
});
