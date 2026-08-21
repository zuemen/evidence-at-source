/**
 * 為什麼有這個檔案。
 *
 * 用 GLEIF 的方法論把論述從動作往回推之後，一次逼出五個落差，而五個的形狀完全一樣：
 * **檢查寫好了、有測試，但沒有任何呼叫端把參數傳進去。** `identity`、
 * `minimumIssuerTier`、`expectedFacilityId`、`auditors` 四個政策輸入，全部只有測試會傳。
 *
 * 從攻擊者的角度看，一個永遠收不到參數的可選檢查，和一個從來沒寫的檢查，完全一樣。
 *
 * 所以這個守門是**列舉式**的，跟 `allQueriesGated.test.ts` 同一個作法：它掃描所有正式
 * 程式碼裡的閘門呼叫點，要求每一個都在下面的表上，並且表上記載的內容要跟原始碼相符。
 * 明天新增一個呼叫點，這個測試會失敗，直到有人明白寫下它傳了什麼、以及沒傳的為什麼。
 * 「不小心漏掉」不再是這個測試留給人的選項。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const EOL = String.fromCharCode(10);

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The optional policy inputs that were all reachable only from tests. */
const POLICY_INPUTS = [
  'revocations',
  'identity',
  'minimumIssuerTier',
  'expectedFacilityId',
  'auditors',
] as const;

/**
 * Every gate call site in production code, and what it is expected to pass.
 *
 * An omission needs a reason next to it. "The demo does not need it" is not one
 * — the demo is the decision path a judge will read.
 */
const EXPECTED: Record<string, { readonly passes: readonly string[]; readonly why: string }> = {
  // The aggregate path. Facility binding is supplied by the caller, since only
  // the caller knows which plant is being audited.
  'packages/agents/src/cohort.ts#0': {
    passes: ['revocations', 'minimumIssuerTier', 'expectedFacilityId', 'auditors'],
    why: 'Forwards whatever the asking institution supplied. `identity` is absent because an RBA compliance query must not learn which wallet answered — that is the anti-retaliation boundary, not an oversight.',
  },
  // ZK binding re-validates the two credentials a proof claims to be about.
  'packages/agents/src/zkReconciliation.ts#0': {
    passes: ['revocations'],
    why: 'Checks that a credential is genuine and unrevoked so a proof can be bound to it. Tier, facility and auditor are the asking verifier’s policy and are applied on the path that asks; presence is irrelevant to a proof produced offline.',
  },
  // The T8 prompt-injection fixture.
  'packages/web/src/demo/world.ts#0': {
    passes: [],
    why: 'A fixture that shows an injected remark surviving into a payload without changing the verdict. It deliberately runs the plainest possible gate call so the demonstration is about the injection and nothing else.',
  },
  // Account opening — the path 題05 Q1/Q2 exists for.
  'packages/web/src/demo/world.ts#1': {
    passes: ['revocations', 'identity'],
    why: 'The bank decision path. `identity` was missing here, which is exactly how the broker-holding-the-phone case went unblocked. Tier and facility are RBA concerns and do not apply to opening an account.',
  },
};

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(full);
  }

  return found;
}

/** Extracts the balanced object literal that follows a call. */
function argumentAt(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, at + 1);
    }
  }

  return source.slice(open);
}

/**
 * Whether an object literal actually passes `key` as a property.
 *
 * Written as a scan rather than a regex because `request.revocations` and
 * `{ revocations: ... }` differ only in the character before the name, and a
 * guard that confused the two would report the very thing it exists to catch.
 */
function mentionsKey(raw: string, key: string): boolean {
  // Line comments are stripped first, so that a key merely named in a comment —
  // or one commented out — never counts as passed. A guard fooled by prose
  // about the check is worse than no guard. Done by hand rather than with a
  // regex because the thing being scanned is itself source code full of them.
  const literal = raw
    .split(EOL)
    .map((line) => (line.includes('//') ? line.slice(0, line.indexOf('//')) : line))
    .join(EOL);

  for (let at = literal.indexOf(key); at !== -1; at = literal.indexOf(key, at + 1)) {
    const before = literal.slice(0, at).trimEnd().slice(-1);
    const after = literal.slice(at + key.length).trimStart().slice(0, 1);
    // A property, not a member access: preceded by `{` or `,`, and followed by
    // `:` for a normal property or `,`/`}` for shorthand.
    const isProperty = before === '{' || before === ',' || before === '';
    if (isProperty && (after === ':' || after === ',' || after === '}')) {
      return true;
    }
  }

  return false;
}

interface CallSite {
  readonly id: string;
  readonly passes: readonly string[];
}

function gateCallSites(): CallSite[] {
  const sites: CallSite[] = [];

  for (const pkg of readdirSync(join(ROOT, 'packages'))) {
    const src = join(ROOT, 'packages', pkg, 'src');
    let files: string[];
    try {
      files = sourceFiles(src);
    } catch {
      continue;
    }

    for (const file of files.sort()) {
      const source = readFileSync(file, 'utf-8');
      const rel = relative(ROOT, file).split(sep).join('/');
      let index = 0;
      // The definition itself is not a call site.
      const pattern = /checkCredentialLayer\(\s*\{/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const literal = argumentAt(source, source.indexOf('{', match.index));
        sites.push({
          id: `${rel}#${index}`,
          passes: POLICY_INPUTS.filter((key) => mentionsKey(literal, key)),
        });
        index += 1;
      }
    }
  }

  return sites;
}

describe('每一個閘門呼叫點都要明白宣告它傳了什麼', () => {
  const sites = gateCallSites();

  test('the scan finds call sites, so an empty enumeration cannot pass silently', () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  test('every call site in production code is on the list', () => {
    const undocumented = sites.map((s) => s.id).filter((id) => !(id in EXPECTED));

    expect(
      undocumented,
      'a new gate call site must declare which policy inputs it passes, and why it omits the rest',
    ).toEqual([]);
  });

  test('no listed call site has quietly dropped an input it claims to pass', () => {
    const drifted: string[] = [];

    for (const site of sites) {
      const expected = EXPECTED[site.id];
      if (expected === undefined) continue;

      for (const key of expected.passes) {
        if (!site.passes.includes(key)) drifted.push(`${site.id} no longer passes ${key}`);
      }
    }

    expect(drifted).toEqual([]);
  });

  test('every omission carries a written reason', () => {
    for (const [id, entry] of Object.entries(EXPECTED)) {
      const omitted = POLICY_INPUTS.filter((key) => !entry.passes.includes(key));
      if (omitted.length > 0) {
        // Not a formatting rule: an omission without an argument is how all
        // five of the original gaps came to exist.
        expect(entry.why.length, `${id} omits ${omitted.join(', ')} without explaining why`).toBeGreaterThan(60);
      }
    }
  });
});
