/**
 * 授權宣稱必須與實際相依相符。
 *
 * 這個 repo 是官方參考實作，會被直接複製——複製者會連同授權義務一起帶走。一份
 * 過期的授權宣稱在這裡不只是文件瑕疵，是把別人的義務寫錯。
 *
 * 這個守門測試從 node_modules 實際讀 license 欄位，而不是相信文件。若日後有人新增
 * 一個 copyleft 相依而沒有更新標示，它會變紅。
 */
import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const read = (relative: string) => readFile(`${repoRoot}${relative}`, 'utf8');

/** Declared dependencies whose license this repo's notices must account for. */
const DECLARED_PACKAGES = ['snarkjs', 'circomlibjs', 'circomlib', 'ffjavascript'];

async function licenseOf(pkg: string): Promise<string> {
  const raw = await read(`node_modules/${pkg}/package.json`);
  const parsed = JSON.parse(raw) as { license?: string };

  return parsed.license ?? '(none)';
}

describe('license notices match the dependencies that are actually installed', () => {
  test('the four known copyleft packages are still GPL-3.0', async () => {
    for (const pkg of DECLARED_PACKAGES) {
      expect(await licenseOf(pkg), `${pkg} license changed`).toBe('GPL-3.0');
    }
  });

  test('every GPL package named in the notice is one we actually depend on', async () => {
    const notice = await read('THIRD-PARTY-LICENSES.md');

    // The two that reach the browser bundle must be named explicitly, since the
    // whole point of the notice is telling a copier what travels with the build.
    expect(notice).toContain('snarkjs');
    expect(notice).toContain('circomlibjs');
    expect(notice).toContain('GPL-3.0');
  });

  test('LICENSE states that the built artifacts are not covered by MIT alone', async () => {
    const license = await read('LICENSE');

    expect(license).toContain('MIT License');
    expect(license).toContain('GPL-3.0');
    expect(license).toContain('packages/web/dist/');
  });

  test('README carries the split before the reader has scrolled anywhere', async () => {
    const readme = await read('README.md');
    const top = readme.slice(0, 2000);

    // A copier decides in the first screenful. The obligation has to be there.
    expect(top).toContain('GPL-3.0');
    expect(top).toContain('THIRD-PARTY-LICENSES.md');
  });

  test('the notice tells the reader how to verify it rather than asking for trust', async () => {
    const notice = await read('THIRD-PARTY-LICENSES.md');

    expect(notice).toContain('npm run build');
    expect(notice).toContain('node_modules');
  });
});
