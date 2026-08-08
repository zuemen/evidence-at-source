import { describe, expect, test } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/**
 * Keeps "L0 fails, worker data is never read" a structural property.
 *
 * `runAuthorizedGate` takes the worker-reading step as a callback and only
 * invokes it once the delegation check has passed. That is what makes the
 * guarantee hold by construction rather than by discipline — there is no
 * ordering for a caller to get wrong, because the caller does not own the
 * ordering.
 *
 * The guarantee has one way to leak: a caller that runs `checkAgentDelegation`
 * itself, looks at the boolean, and then reads worker data in its own code.
 * Every check would still be present and the structure would be gone. Nothing
 * in the type system prevents that, so this test does.
 */

const PACKAGES = fileURLToPath(new URL('../../', import.meta.url));

/**
 * `checkAgentDelegation` is L0 in full: validity plus the query-scope checks.
 * Calling it outside the wrapper means someone is about to sequence the gate
 * by hand.
 */
const GATE_ONLY = 'checkAgentDelegation';

/**
 * `verifyDelegationValidity` is the query-independent half, and the wallet is
 * a legitimate caller of it.
 *
 * The wallet is not a verifier deciding whether to answer — it is the worker's
 * own device deciding whether to disclose, before any query exists. It has no
 * worker data to leak by calling this: the data is already the holder's. The
 * whole "上限由機構給、下限由勞工給" argument depends on this call existing,
 * so it is allowed by name rather than by accident.
 */
const VALIDITY_ALLOWLIST = [
  join('web', 'src', 'wallet', 'reviewDelegation.ts'),
  // The demo world renders the wallet's view of an agent's standing, which is
  // the same question the wallet asks and for the same reason.
  join('web', 'src', 'demo', 'world.ts'),
];

async function productionSources(): Promise<string[]> {
  const entries = await readdir(PACKAGES, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes('node_modules'))
    .filter((path) => path.includes(join('src', '')))
    .filter((path) => !path.endsWith('.d.ts'));
}

/** Call sites, ignoring imports, re-exports and prose in comments. */
function callSites(source: string, symbol: string): number {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) return false;
      if (trimmed.startsWith('import') || trimmed.startsWith('export')) return false;

      return trimmed.includes(`${symbol}(`);
    }).length;
}

describe('the authorization gate cannot be sequenced by hand', () => {
  test('only runAuthorizedGate calls checkAgentDelegation', async () => {
    const sources = await productionSources();
    expect(sources.length, 'the scan found no sources, so it proves nothing').toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const file of sources) {
      const text = await readFile(file, 'utf8');
      if (callSites(text, GATE_ONLY) === 0) continue;

      // delegationGate.ts is where runAuthorizedGate lives; that is the call.
      if (relative(PACKAGES, file) === join('agents', 'src', 'delegationGate.ts')) continue;

      offenders.push(relative(PACKAGES, file));
    }

    expect(
      offenders,
      'these files run L0 themselves instead of handing the worker read to runAuthorizedGate',
    ).toEqual([]);
  });

  test('verifyDelegationValidity is called only from the wallet side', async () => {
    const sources = await productionSources();

    const callers: string[] = [];
    for (const file of sources) {
      const text = await readFile(file, 'utf8');
      if (callSites(text, 'verifyDelegationValidity') === 0) continue;

      const rel = relative(PACKAGES, file);
      if (rel === join('agents', 'src', 'delegationGate.ts')) continue;
      if (VALIDITY_ALLOWLIST.includes(rel)) continue;

      callers.push(rel);
    }

    expect(
      callers,
      'a verifier-side file used the wallet-side check; add it to the allowlist with a reason, or use runAuthorizedGate',
    ).toEqual([]);
  });

  test('the wrapper really is the only production path into L0', async () => {
    // The mirror of the first test. If runAuthorizedGate ever stopped calling
    // checkAgentDelegation, the guard above would pass over a system whose
    // authorization layer had quietly become optional.
    const gate = await readFile(join(PACKAGES, 'agents', 'src', 'delegationGate.ts'), 'utf8');
    const wrapper = gate.slice(gate.indexOf('export async function runAuthorizedGate'));

    expect(wrapper).toContain(`await ${GATE_ONLY}(ctx)`);
  });
});
