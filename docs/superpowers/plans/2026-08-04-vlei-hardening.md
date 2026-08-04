# vLEI 深化 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 docs/vlei.md 明文簡化清單中三項可在 PoC 範圍內解決的補實——門檻多簽 AID（GLEIF root 2-of-3）、TEL 事件錨定 KEL（封死舊金鑰偽簽 TEL 事件的已知限制）、可攜出示包（KEL/TEL 隨出示打包，取代 in-process store 共享）。

**Architecture:** 全部收在 `@eas/vlei` 內：(1) KEL 升級為門檻多簽——`kt`/`nt` 門檻、`sigs[]` 平行於 `k[]`、`verifyThreshold` 統一驗簽入口，TEL/ACDC 簽章跟著換型；(2) 新增 `ixn` 互動事件與 seal 錨定——每個 TEL 事件先錨進控制者 KEL 再簽發，驗證方 fail-closed 要求錨存在，偷舊金鑰者無法在不持有現行金鑰的情況下往 KEL 追加錨；(3) `portable.ts` 把出示所需的 credentials+KELs+TELs 序列化成單一 JSON 字串，驗證方僅憑外帶釘選的 root AID 重建信任上下文。橋接層（agents/web）零改動——它們不觸碰簽章欄位。

**Tech Stack:** 既有 `@noble/curves`/`@noble/hashes`，零新依賴。

## Global Constraints

- Node `>=22`；不新增任何依賴。
- `@eas/vlei` 對外 API 破壞面僅限：`SignedKelEvent.sig → sigs`、`SignedTelEvent.sig → sigs`、`SignedAcdc.sig → sigs`、`AidController.sign` 回傳 `{ sigs, sigSeq }`、`KelStore.verferAt → keyStateAt`。`verifyEcrChain`/`verifyLeChain`/`VleiPresentation`/`Ecosystem` 介面不變——agents 與 web 不需要改。
- 每 task 結束 `npx vitest run` 全綠 + `npm run typecheck` 無錯誤才 commit；最終 `npm run demo:vlei` exit 0。
- fail-closed 原則不可退讓：驗不過的 KEL/TEL/錨一律當不存在，不得放行。
- 文件繁中、程式碼與註解英文；原因碼／failure 代碼 SCREAMING_SNAKE_CASE。
- `poc/` 不動；合成資料原則三照舊。

## File Structure

```
packages/vlei/src/kel.ts        # 重寫：門檻多簽 + ixn 錨定 + KeyState/verifyThreshold/isAnchored
packages/vlei/src/tel.ts        # 修改：sigs[] + append 前先 anchor + eventValid 查錨
packages/vlei/src/acdc.ts       # 修改：sigs[] + keyStateAt/verifyThreshold
packages/vlei/src/ecosystem.ts  # 修改：GLEIF root 2-of-3 + gleifKeyState 曝露
packages/vlei/src/portable.ts   # 新增：exportChainArtifacts / importVerifierContext
packages/vlei/src/index.ts      # 修改：exports
packages/vlei/test/kel.test.ts  # 更新 + 多簽/錨定案例
packages/vlei/test/tel.test.ts  # 更新 + 未錨定 fail-closed 案例
packages/vlei/test/acdc.test.ts # 更新（sigs 欄位）
packages/vlei/test/chain.test.ts# 不動（介面未變）
packages/vlei/test/portable.test.ts # 新增
packages/vlei/demo/vleiCascade.ts   # 修改：+3 步（多簽根、可攜包 roundtrip、線上竄改拒絕）
docs/vlei.md                    # 修改：明文簡化清單改寫
docs/vlei-defense.md            # 修改：Q1/Q3 更新
```

---

### Task 1: 門檻多簽 KEL（kt/nt 門檻、sigs[]、keyStateAt）

**Files:**
- Rewrite: `packages/vlei/src/kel.ts`
- Modify: `packages/vlei/src/tel.ts`、`packages/vlei/src/acdc.ts`（簽章欄位換型）
- Modify: `packages/vlei/src/index.ts`
- Test: `packages/vlei/test/kel.test.ts`（改寫）、`packages/vlei/test/tel.test.ts`、`packages/vlei/test/acdc.test.ts`（欄位更名處）

**Interfaces:**
- Produces（後續 task 依賴，名稱不得偏移）：
  - `interface KeyState { keys: readonly string[]; threshold: number }`
  - `interface AidOptions { keyCount?: number; threshold?: number }`（預設 1／keyCount）
  - `interface SignedKelEvent { event: KelEvent; sigs: readonly string[] }`
  - `interface AidController { aid; kel; currentKeyState(): KeyState; sign(data): { sigs: readonly string[]; sigSeq: number }; rotate(): void }`
  - `createAid(options?: AidOptions): AidController`
  - `verifyThreshold(state: KeyState, sigs: readonly string[], data: Uint8Array): boolean`（sigs 與 keys 平行同長，有效簽數 ≥ threshold）
  - `KelStore.keyStateAt(aid: string, seq: number): KeyState | undefined`（取代 `verferAt`）
  - `SignedTelEvent { event; sigs; sigSeq }`、`SignedAcdc { acdc; sigs; sigSeq }`
- 語意：`sign()` 的 `sigSeq` 仍是最近 establishment event 序號；pre-rotation 承諾逐 index 比對（`rot.k[i]` 的 digest === 前一 establishment 的 `n[i]`，且 `rot.kt === 前一 nt`）。

- [ ] **Step 1: 改寫 `packages/vlei/test/kel.test.ts`（先寫測試，此刻必 fail）**

```ts
import { describe, expect, test } from 'vitest';
import { utf8ToBytes } from '@eas/shared';
import {
  KelStore,
  createAid,
  createKeyMaterial,
  verifyKel,
  verifyThreshold,
  type SignedKelEvent,
} from '@eas/vlei';

describe('AID inception and rotation (threshold multisig)', () => {
  test('a default single-sig AID incepts and verifies', () => {
    const controller = createAid();

    expect(controller.aid).toBe(controller.kel[0]?.event.d);
    expect(controller.currentKeyState().threshold).toBe(1);
    expect(verifyKel(controller.kel)).toBe(true);
  });

  test('a 2-of-3 AID incepts, signs and verifies at threshold', () => {
    const controller = createAid({ keyCount: 3, threshold: 2 });
    const data = utf8ToBytes('payload');
    const { sigs, sigSeq } = controller.sign(data);

    expect(sigSeq).toBe(0);
    expect(sigs).toHaveLength(3);
    expect(verifyThreshold(controller.currentKeyState(), sigs, data)).toBe(true);
  });

  test('below-threshold signatures are refused', () => {
    const controller = createAid({ keyCount: 3, threshold: 2 });
    const data = utf8ToBytes('payload');
    const { sigs } = controller.sign(data);
    const stranger = createAid({ keyCount: 3, threshold: 2 });
    const foreign = stranger.sign(data).sigs;

    // Two of three signatures replaced by another controller's: only one valid.
    const crippled = [sigs[0]!, foreign[1]!, foreign[2]!];

    expect(verifyThreshold(controller.currentKeyState(), crippled, data)).toBe(false);
  });

  test('rotation honours per-index pre-rotation commitments for all keys', () => {
    const controller = createAid({ keyCount: 3, threshold: 2 });
    controller.rotate();

    expect(controller.kel).toHaveLength(2);
    expect(verifyKel(controller.kel)).toBe(true);
    expect(controller.currentKeyState().keys).toHaveLength(3);
  });

  test('KelStore resolves the full key state per establishment seq', () => {
    const store = new KelStore();
    const controller = createAid({ keyCount: 2, threshold: 2 });
    store.register(controller.kel);

    const before = controller.currentKeyState().keys;
    controller.rotate();

    expect(store.keyStateAt(controller.aid, 0)?.keys).toEqual(before);
    expect(store.keyStateAt(controller.aid, 1)?.keys).toEqual(controller.currentKeyState().keys);
    expect(store.keyStateAt(controller.aid, 9)).toBeUndefined();
  });

  test('a tampered KEL fails verification and the store fails closed', () => {
    const store = new KelStore();
    const controller = createAid();
    store.register(controller.kel);

    const forged = createKeyMaterial();
    const kel = controller.kel as SignedKelEvent[];
    const icp = kel[0]!;
    kel[0] = { ...icp, event: { ...icp.event, k: [forged.verfer] } };

    expect(verifyKel(kel)).toBe(false);
    expect(store.keyStateAt(controller.aid, 0)).toBeUndefined();
  });

  test('a rotation that breaks any pre-rotation commitment is rejected', () => {
    const controller = createAid({ keyCount: 2, threshold: 2 });
    controller.rotate();

    const kel = controller.kel as SignedKelEvent[];
    const rot = kel[1]!;
    const stranger = createKeyMaterial();
    const keys = [...(rot.event.k ?? [])];
    keys[1] = stranger.verfer;
    kel[1] = { ...rot, event: { ...rot.event, k: keys } };

    expect(verifyKel(kel)).toBe(false);
  });

  test('invalid threshold configurations are refused at creation', () => {
    expect(() => createAid({ keyCount: 2, threshold: 3 })).toThrow();
    expect(() => createAid({ keyCount: 0 })).toThrow();
    expect(() => createAid({ keyCount: 3, threshold: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: 跑測試，確認 fail**

Run: `npx vitest run packages/vlei/test/kel.test.ts`
Expected: FAIL（`verifyThreshold`/`keyStateAt`/`currentKeyState` 不存在）

- [ ] **Step 3: 改寫 `packages/vlei/src/kel.ts`**（完整檔案；`k`/`kt`/`nt`/`n`/`bt` 先保持必填，Task 2 才放寬給 ixn）

```ts
/**
 * Threshold-multisig KERI key event logs with pre-rotation.
 *
 * An AID is the SAID of its inception event. Key state is a set of keys plus a
 * signing threshold (kt); every event carries one signature per current key and
 * verifies when at least `threshold` of them hold. Every rotation must present
 * keys whose digests were committed per-index in the previous establishment
 * event's `n` field. No witnesses, no delegation — documented simplifications.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { blake3 } from '@noble/hashes/blake3';
import { utf8ToBytes } from '@eas/shared';
import { MATTER_CODES, decodeMatter, encodeMatter } from './cesr.js';
import { saidify, verifySaid, versify, type Ked } from './said.js';

export interface KeyMaterial {
  readonly verfer: string;
  readonly secret: Uint8Array;
}

export function createKeyMaterial(): KeyMaterial {
  const secret = ed25519.utils.randomPrivateKey();
  return { secret, verfer: encodeMatter(MATTER_CODES.Ed25519, ed25519.getPublicKey(secret)) };
}

function digestOfQb64(qb64: string): string {
  return encodeMatter(MATTER_CODES.Blake3_256, blake3(utf8ToBytes(qb64), { dkLen: 32 }));
}

export interface KeyState {
  readonly keys: readonly string[];
  readonly threshold: number;
}

export interface KelEvent {
  readonly v: string;
  readonly t: 'icp' | 'rot';
  readonly d: string;
  readonly i: string;
  readonly s: string;
  readonly p?: string;
  readonly kt: string;
  readonly k: readonly string[];
  readonly nt: string;
  readonly n: readonly string[];
  readonly bt: string;
  readonly b?: readonly string[];
  readonly br?: readonly string[];
  readonly ba?: readonly string[];
  readonly c?: readonly string[];
  readonly a: readonly unknown[];
}

export interface SignedKelEvent {
  readonly event: KelEvent;
  readonly sigs: readonly string[];
}

export interface AidOptions {
  readonly keyCount?: number;
  readonly threshold?: number;
}

export interface AidController {
  readonly aid: string;
  readonly kel: readonly SignedKelEvent[];
  currentKeyState(): KeyState;
  sign(data: Uint8Array): { sigs: readonly string[]; sigSeq: number };
  rotate(): void;
}

function freshKeys(count: number): KeyMaterial[] {
  return Array.from({ length: count }, () => createKeyMaterial());
}

function signAll(event: Ked, materials: readonly KeyMaterial[]): string[] {
  const bytes = utf8ToBytes(JSON.stringify(event));
  return materials.map((material) =>
    encodeMatter(MATTER_CODES.Ed25519_Sig, ed25519.sign(bytes, material.secret)),
  );
}

/** Signatures are index-parallel to keys; at least `threshold` must verify. */
export function verifyThreshold(
  state: KeyState,
  sigs: readonly string[],
  data: Uint8Array,
): boolean {
  if (sigs.length !== state.keys.length) return false;

  let valid = 0;
  for (let at = 0; at < state.keys.length; at++) {
    const sig = sigs[at];
    const key = state.keys[at];
    if (sig === undefined || key === undefined) continue;
    try {
      if (ed25519.verify(decodeMatter(sig).raw, data, decodeMatter(key).raw)) valid++;
    } catch {
      // A malformed signature simply does not count toward the threshold.
    }
  }

  return valid >= state.threshold;
}

function eventKeyState(event: KelEvent): KeyState {
  return { keys: event.k, threshold: parseInt(event.kt, 16) };
}

export function createAid(options: AidOptions = {}): AidController {
  const keyCount = options.keyCount ?? 1;
  const threshold = options.threshold ?? keyCount;
  if (keyCount < 1 || threshold < 1 || threshold > keyCount) {
    throw new Error('threshold must satisfy 1 <= threshold <= keyCount');
  }

  let current = freshKeys(keyCount);
  let next = freshKeys(keyCount);
  let estSeq = 0;
  const kel: SignedKelEvent[] = [];

  const icp = saidify(
    {
      v: versify('KERI', 0),
      t: 'icp' as const,
      d: '',
      i: '',
      s: '0',
      kt: threshold.toString(16),
      k: current.map((m) => m.verfer),
      nt: threshold.toString(16),
      n: next.map((m) => digestOfQb64(m.verfer)),
      bt: '0',
      b: [],
      c: [],
      a: [],
    },
    ['d', 'i'],
  );
  kel.push({ event: icp as unknown as KelEvent, sigs: signAll(icp, current) });

  return {
    aid: icp.i,
    kel,

    currentKeyState: () => ({ keys: current.map((m) => m.verfer), threshold }),

    sign(data) {
      return {
        sigs: current.map((m) => encodeMatter(MATTER_CODES.Ed25519_Sig, ed25519.sign(data, m.secret))),
        sigSeq: estSeq,
      };
    },

    rotate() {
      const upcoming = freshKeys(keyCount);
      const prior = kel[kel.length - 1]!.event;
      const seq = parseInt(prior.s, 16) + 1;
      const rot = saidify({
        v: versify('KERI', 0),
        t: 'rot' as const,
        d: '',
        i: icp.i,
        s: seq.toString(16),
        p: prior.d,
        kt: threshold.toString(16),
        k: next.map((m) => m.verfer),
        nt: threshold.toString(16),
        n: upcoming.map((m) => digestOfQb64(m.verfer)),
        bt: '0',
        br: [],
        ba: [],
        a: [],
      });

      // KERI rotation is signed by the newly-current keys.
      current = next;
      next = upcoming;
      estSeq = seq;
      kel.push({ event: rot as unknown as KelEvent, sigs: signAll(rot, current) });
    },
  };
}

function signaturesValid(signed: SignedKelEvent, state: KeyState): boolean {
  return verifyThreshold(state, signed.sigs, utf8ToBytes(JSON.stringify(signed.event)));
}

export function verifyKel(kel: readonly SignedKelEvent[]): boolean {
  const first = kel[0];
  if (first === undefined) return false;

  const icp = first.event;
  if (icp.t !== 'icp' || icp.s !== '0' || icp.i !== icp.d) return false;
  if (!verifySaid(icp as unknown as Ked, ['d', 'i'])) return false;
  if (!signaturesValid(first, eventKeyState(icp))) return false;

  let lastEst = icp;
  for (let at = 1; at < kel.length; at++) {
    const prev = kel[at - 1]!.event;
    const signed = kel[at]!;
    const rot = signed.event;

    if (rot.t !== 'rot' || rot.i !== icp.i) return false;
    if (parseInt(rot.s, 16) !== parseInt(prev.s, 16) + 1) return false;
    if (rot.p !== prev.d) return false;
    if (!verifySaid(rot as unknown as Ked)) return false;

    // Pre-rotation: every new key must match the per-index commitment made by
    // the last establishment event, and the committed threshold must hold.
    if (rot.k.length !== lastEst.n.length) return false;
    if (!rot.k.every((key, idx) => digestOfQb64(key) === lastEst.n[idx])) return false;
    if (parseInt(rot.kt, 16) !== parseInt(lastEst.nt, 16)) return false;
    if (!signaturesValid(signed, eventKeyState(rot))) return false;

    lastEst = rot;
  }

  return true;
}

export class KelStore {
  private readonly kels = new Map<string, readonly SignedKelEvent[]>();

  /** Registers a live reference: later rotations by the controller are visible. */
  register(kel: readonly SignedKelEvent[]): void {
    const aid = kel[0]?.event.i;
    if (aid === undefined || !verifyKel(kel)) {
      throw new Error('refusing to register an invalid KEL');
    }
    this.kels.set(aid, kel);
  }

  /** Re-verifies the whole KEL on every read; a tampered log resolves nothing. */
  keyStateAt(aid: string, seq: number): KeyState | undefined {
    const kel = this.kels.get(aid);
    if (kel === undefined || !verifyKel(kel)) return undefined;

    const establishment = kel.find(
      (signed) =>
        parseInt(signed.event.s, 16) === seq &&
        (signed.event.t === 'icp' || signed.event.t === 'rot'),
    );
    return establishment === undefined ? undefined : eventKeyState(establishment.event);
  }
}
```

- [ ] **Step 4: 換型 `packages/vlei/src/tel.ts` 的簽章欄位**

- `SignedTelEvent`：`readonly sig: string` → `readonly sigs: readonly string[]`。
- `CredentialRegistry.append`：

```ts
  private append(event: TelEvent): void {
    const { sigs, sigSeq } = this.controller.sign(utf8ToBytes(JSON.stringify(event)));
    this.events.push({ event, sigs, sigSeq });
  }
```

- `TelStore.eventValid` 末段改為：

```ts
    const state = this.kels.keyStateAt(controllerAid, signed.sigSeq);
    if (state === undefined) return false;

    return verifyThreshold(state, signed.sigs, utf8ToBytes(JSON.stringify(signed.event)));
```

（import 區：`decodeMatter`、`ed25519` 不再需要則移除；改 import `verifyThreshold`。）

- [ ] **Step 5: 換型 `packages/vlei/src/acdc.ts`**

- `SignedAcdc`：`readonly sig: string` → `readonly sigs: readonly string[]`。
- `issueAcdc` 末段：

```ts
  const { sigs, sigSeq } = input.issuer.sign(utf8ToBytes(JSON.stringify(acdc)));
  return { acdc, sigs, sigSeq };
```

- `verifyAcdc` 簽章段改為：

```ts
  const state = trust.kels.keyStateAt(acdc.i, signed.sigSeq);
  if (state === undefined) return { ok: false, failure: 'SIGNATURE_INVALID' };
  if (!verifyThreshold(state, signed.sigs, utf8ToBytes(JSON.stringify(acdc)))) {
    return { ok: false, failure: 'SIGNATURE_INVALID' };
  }
```

（import 區改用 `verifyThreshold`，移除 `ed25519`/`decodeMatter`。）

- [ ] **Step 6: 更新既有測試中的欄位**

- `packages/vlei/test/tel.test.ts`：竄改案例中 `{ ...last, event: {...} }` 不受影響（欄位名稱沒動到 sig）——確認編譯即可。
- `packages/vlei/test/acdc.test.ts`：`a signature from a key the KEL never established` 案例改為 `const forged: SignedAcdc = { ...signed, sigs: issueQvi(stranger).sigs };`。
- `packages/vlei/src/index.ts`：export 增改——`verifyThreshold`、`type KeyState`、`type AidOptions`；`createAid`/`KelStore` 照舊。

- [ ] **Step 7: 全套跑綠 + commit**

Run: `npx vitest run && npm run typecheck && npm run demo:vlei`
Expected: 全 PASS、demo exit 0

```bash
git add packages/vlei
git commit -m "feat(vlei): threshold multisig AIDs with per-index pre-rotation"
```

---

### Task 2: TEL 事件錨定 KEL（ixn + seal，封死舊金鑰偽簽）

**Files:**
- Modify: `packages/vlei/src/kel.ts`（加 ixn／anchor／isAnchored）
- Modify: `packages/vlei/src/tel.ts`（append 先錨定；eventValid 查錨）
- Modify: `packages/vlei/src/index.ts`
- Test: `packages/vlei/test/kel.test.ts`（追加）、`packages/vlei/test/tel.test.ts`（追加）

**Interfaces:**
- Produces：
  - `KelEvent.t` union 加 `'ixn'`；`kt`/`k`/`nt`/`n`/`bt` 改為 optional（ixn 不帶）；`a: readonly { d: string }[]`（seal 陣列）。
  - `AidController.anchor(said: string): void`——追加一筆由現行金鑰門檻簽署的 ixn，`a: [{ d: said }]`。
  - `KelStore.isAnchored(aid: string, said: string): boolean`——KEL 驗證通過且任一事件的 seal 含該 SAID。
- 語意：`CredentialRegistry` 的每個事件（vcp/iss/rev）都先 `controller.anchor(event.d)` 再簽發；`TelStore.eventValid` 要求 `isAnchored`，未錨定事件 fail-closed 為 `unknown`。偷到舊金鑰者可以偽簽 TEL 事件本體，但無法用舊金鑰延長 KEL 去補錨——防禦 Q3 的已知限制就此關閉。

- [ ] **Step 1: 追加 failing tests**

`packages/vlei/test/kel.test.ts` 檔尾追加：

```ts
describe('interaction events and anchoring', () => {
  test('anchor() appends a verifiable ixn carrying the seal', () => {
    const store = new KelStore();
    const controller = createAid();
    store.register(controller.kel);
    const said = 'E' + 'S'.repeat(43);

    controller.anchor(said);

    expect(controller.kel).toHaveLength(2);
    expect(controller.kel[1]?.event.t).toBe('ixn');
    expect(verifyKel(controller.kel)).toBe(true);
    expect(store.isAnchored(controller.aid, said)).toBe(true);
    expect(store.isAnchored(controller.aid, 'E' + 'X'.repeat(43))).toBe(false);
  });

  test('rotation still verifies across interleaved ixn events', () => {
    const controller = createAid({ keyCount: 2, threshold: 2 });
    controller.anchor('E' + 'A'.repeat(43));
    controller.rotate();
    controller.anchor('E' + 'B'.repeat(43));

    expect(verifyKel(controller.kel)).toBe(true);
    const store = new KelStore();
    store.register(controller.kel);
    expect(store.keyStateAt(controller.aid, 2)?.keys).toEqual(
      controller.currentKeyState().keys,
    );
  });

  test('a tampered seal breaks KEL verification', () => {
    const controller = createAid();
    controller.anchor('E' + 'A'.repeat(43));

    const kel = controller.kel as SignedKelEvent[];
    const ixn = kel[1]!;
    kel[1] = { ...ixn, event: { ...ixn.event, a: [{ d: 'E' + 'Z'.repeat(43) }] } };

    expect(verifyKel(kel)).toBe(false);
  });
});
```

`packages/vlei/test/tel.test.ts` 檔尾追加：

```ts
describe('TEL anchoring in the controller KEL', () => {
  test('normal issuance is anchored and reports issued', () => {
    const { kels, tels, controller, registry } = setup();
    registry.issue(CRED_SAID);

    expect(kels.isAnchored(controller.aid, registry.events[1]!.event.d)).toBe(true);
    expect(tels.status(registry.registryId, CRED_SAID)).toBe('issued');
  });

  test('a validly-signed but unanchored event fails closed to unknown', () => {
    const { tels, controller, registry } = setup();
    registry.issue(CRED_SAID);

    // An attacker with the controller's signing keys forges a revocation but
    // cannot extend the KEL to anchor it.
    const forgedRev = saidify({
      v: versify('KERI', 0),
      t: 'rev' as const,
      d: '',
      i: CRED_SAID,
      s: '1',
      ri: registry.registryId,
      p: registry.events[1]!.event.d,
      dt: '2026-08-04T00:00:00Z',
    });
    const { sigs, sigSeq } = controller.sign(utf8ToBytes(JSON.stringify(forgedRev)));
    (registry.events as SignedTelEvent[]).push({
      event: forgedRev as unknown as TelEvent,
      sigs,
      sigSeq,
    });

    expect(tels.status(registry.registryId, CRED_SAID)).toBe('unknown');
  });
});
```

（該檔 import 區補：`saidify`、`versify` 來自 `@eas/vlei`，`utf8ToBytes` 來自 `@eas/shared`，`type TelEvent` 來自 `@eas/vlei`。）

- [ ] **Step 2: 跑測試，確認 fail**

Run: `npx vitest run packages/vlei/test/kel.test.ts packages/vlei/test/tel.test.ts`
Expected: FAIL（`anchor`/`isAnchored` 不存在）

- [ ] **Step 3: 修改 `packages/vlei/src/kel.ts`**

(a) `KelEvent` 型別改為：

```ts
export interface KelEvent {
  readonly v: string;
  readonly t: 'icp' | 'rot' | 'ixn';
  readonly d: string;
  readonly i: string;
  readonly s: string;
  readonly p?: string;
  readonly kt?: string;
  readonly k?: readonly string[];
  readonly nt?: string;
  readonly n?: readonly string[];
  readonly bt?: string;
  readonly b?: readonly string[];
  readonly br?: readonly string[];
  readonly ba?: readonly string[];
  readonly c?: readonly string[];
  readonly a: readonly { readonly d: string }[];
}
```

(b) `eventKeyState` 加防衛：

```ts
function eventKeyState(event: KelEvent): KeyState | undefined {
  if (event.k === undefined || event.kt === undefined) return undefined;
  return { keys: event.k, threshold: parseInt(event.kt, 16) };
}
```

（呼叫端配合判空：icp/rot 路徑上 `undefined` 一律回 `false`。）

(c) `AidController` 介面加 `anchor(said: string): void`，`createAid` 回傳物件加：

```ts
    anchor(said) {
      const prior = kel[kel.length - 1]!.event;
      const seq = parseInt(prior.s, 16) + 1;
      const ixn = saidify({
        v: versify('KERI', 0),
        t: 'ixn' as const,
        d: '',
        i: icp.i,
        s: seq.toString(16),
        p: prior.d,
        a: [{ d: said }],
      });
      kel.push({ event: ixn as unknown as KelEvent, sigs: signAll(ixn, current) });
    },
```

(d) `verifyKel` 迴圈改為同時接受 rot 與 ixn（完整替換迴圈本體）：

```ts
  let lastEst = icp;
  for (let at = 1; at < kel.length; at++) {
    const prev = kel[at - 1]!.event;
    const signed = kel[at]!;
    const event = signed.event;

    if (event.i !== icp.i) return false;
    if (parseInt(event.s, 16) !== parseInt(prev.s, 16) + 1) return false;
    if (event.p !== prev.d) return false;
    if (!verifySaid(event as unknown as Ked)) return false;

    if (event.t === 'ixn') {
      // Interaction events are signed by the keys current at that point.
      const state = eventKeyState(lastEst);
      if (state === undefined || !signaturesValid(signed, state)) return false;
      continue;
    }

    if (event.t !== 'rot') return false;
    const rotState = eventKeyState(event);
    if (rotState === undefined) return false;
    if (event.k === undefined || lastEst.n === undefined || lastEst.nt === undefined) return false;
    if (event.k.length !== lastEst.n.length) return false;
    if (!event.k.every((key, idx) => digestOfQb64(key) === lastEst.n![idx])) return false;
    if (event.kt === undefined || parseInt(event.kt, 16) !== parseInt(lastEst.nt, 16)) return false;
    if (!signaturesValid(signed, rotState)) return false;

    lastEst = event;
  }
```

（icp 開頭段也配合：`const icpState = eventKeyState(icp); if (icpState === undefined || !signaturesValid(first, icpState)) return false;`）

(e) `KelStore` 加：

```ts
  /** True only when the KEL verifies and some event carries a seal for `said`. */
  isAnchored(aid: string, said: string): boolean {
    const kel = this.kels.get(aid);
    if (kel === undefined || !verifyKel(kel)) return false;

    return kel.some((signed) => signed.event.a.some((seal) => seal.d === said));
  }
```

（`keyStateAt` 的 `eventKeyState(establishment.event)` 配合可能回 `undefined`——直接回傳該值即可。）

- [ ] **Step 4: 修改 `packages/vlei/src/tel.ts`**

- `CredentialRegistry.append` 改為先錨再簽：

```ts
  private append(event: TelEvent): void {
    // Anchor first: the KEL seal is what an old-key forger cannot produce.
    this.controller.anchor(event.d);
    const { sigs, sigSeq } = this.controller.sign(utf8ToBytes(JSON.stringify(event)));
    this.events.push({ event, sigs, sigSeq });
  }
```

- `TelStore.eventValid` 開頭加：

```ts
    if (!this.kels.isAnchored(controllerAid, signed.event.d)) return false;
```

- [ ] **Step 5: 跑測試，確認 pass；全套回歸**

Run: `npx vitest run && npm run typecheck && npm run demo:vlei`
Expected: 全 PASS、demo exit 0（既有案例含 rotation-interleaved TEL 均應照常通過）

- [ ] **Step 6: Commit**

```bash
git add packages/vlei
git commit -m "feat(vlei): anchor TEL events in the controller KEL; unanchored events fail closed"
```

---

### Task 3: GLEIF root 改 2-of-3 多簽

**Files:**
- Modify: `packages/vlei/src/ecosystem.ts`
- Modify: `packages/vlei/src/index.ts`（型別 re-export 不變，僅確認 `KeyState` 已匯出）
- Test: `packages/vlei/test/chain.test.ts`（追加一組）

**Interfaces:**
- Consumes: Task 1 的 `createAid(options)`／`currentKeyState()`。
- Produces: `Ecosystem` 介面加 `readonly gleifKeyState: KeyState`（bootstrap 當下快照；root 不輪替）。

- [ ] **Step 1: 追加 failing test**

`packages/vlei/test/chain.test.ts` 檔尾追加：

```ts
describe('multisig GLEIF root', () => {
  test('the root is 2-of-3 and every chain still verifies against it', () => {
    const { eco, le } = bank();

    expect(eco.gleifKeyState.keys).toHaveLength(3);
    expect(eco.gleifKeyState.threshold).toBe(2);
    expect(verifyEcrChain(le.grantEcr('did:key:zBankAgent'), eco.trust).ok).toBe(true);

    eco.revokeQviCredential();
    expect(verifyLeChain(le.presentation(), eco.trust).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試，確認 fail**

Run: `npx vitest run packages/vlei/test/chain.test.ts`
Expected: FAIL（`gleifKeyState` 不存在）

- [ ] **Step 3: 修改 `packages/vlei/src/ecosystem.ts`**

- import 區補 `type KeyState`（自 `./kel.js`）。
- `Ecosystem` 介面加一行：

```ts
  /** Snapshot of the GLEIF root key state (multisig threshold demo surface). */
  readonly gleifKeyState: KeyState;
```

- `bootstrapEcosystem` 內：

```ts
  // GLEIF's real root is council-held multisig; the PoC mirrors that shape.
  const gleif: AidController = createAid({ keyCount: 3, threshold: 2 });
```

- 回傳物件加：

```ts
    gleifKeyState: gleif.currentKeyState(),
```

- [ ] **Step 4: 跑測試 + 全套回歸 + commit**

Run: `npx vitest run && npm run typecheck && npm run demo:vlei`
Expected: 全 PASS、demo exit 0

```bash
git add packages/vlei
git commit -m "feat(vlei): 2-of-3 multisig GLEIF root"
```

---

### Task 4: 可攜出示包（exportChainArtifacts / importVerifierContext）

**Files:**
- Create: `packages/vlei/src/portable.ts`
- Modify: `packages/vlei/src/kel.ts`（`KelStore.kelOf`）
- Modify: `packages/vlei/src/tel.ts`（`TelStore` 內部改存事件陣列 + `registerEvents`/`eventsOf`）
- Modify: `packages/vlei/src/index.ts`
- Test: `packages/vlei/test/portable.test.ts`

**Interfaces:**
- Consumes: Task 1–3 全部。
- Produces：
  - `interface ChainArtifacts { presentation: VleiPresentation; kels: Readonly<Record<string, readonly SignedKelEvent[]>>; tels: Readonly<Record<string, readonly SignedTelEvent[]>> }`
  - `exportChainArtifacts(p: VleiPresentation, trust: VleiTrustContext): string`（單一 JSON 字串，含出示所需全部 KEL/TEL）
  - `importVerifierContext(serialized: string, trustedRoots: ReadonlySet<string>): { presentation: VleiPresentation; trust: VleiTrustContext }`（KEL 註冊時即整條驗證，無效即 throw；TEL 逐事件於讀取時驗證）
  - `KelStore.kelOf(aid): readonly SignedKelEvent[] | undefined`、`TelStore.registerEvents(registryId, events)`、`TelStore.eventsOf(registryId)`。
- 語意：驗證方唯一需要帶外（out-of-band）取得的是 root AID——其餘全部隨出示包傳遞、全部重驗。

- [ ] **Step 1: 寫 failing test `packages/vlei/test/portable.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import {
  bootstrapEcosystem,
  exportChainArtifacts,
  importVerifierContext,
  verifyEcrChain,
  type ChainArtifacts,
} from '@eas/vlei';

const JWK = { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' };
const AGENT_DID = 'did:key:zBankAgent';

function world() {
  const eco = bootstrapEcosystem();
  const le = eco.createLegalEntity({
    legalName: '國泰世華銀行',
    didWeb: 'did:web:bank.example',
    leiTag: 'BANKEXAMPLE',
    signingJwk: JWK,
  });
  return { eco, le, chain: le.grantEcr(AGENT_DID) };
}

describe('portable chain artifacts', () => {
  test('a wire-serialized presentation verifies in a rebuilt context', () => {
    const { eco, chain } = world();
    const wire = exportChainArtifacts(chain, eco.trust);

    const imported = importVerifierContext(wire, eco.trust.trustedRoots);
    const verdict = verifyEcrChain(imported.presentation, imported.trust);

    expect(typeof wire).toBe('string');
    expect(verdict.ok).toBe(true);
  });

  test('revocation state travels inside the bundle', () => {
    const { eco, le, chain } = world();
    le.revokeEcr(AGENT_DID);
    const wire = exportChainArtifacts(chain, eco.trust);

    const imported = importVerifierContext(wire, eco.trust.trustedRoots);

    expect(verifyEcrChain(imported.presentation, imported.trust)).toEqual({
      ok: false,
      failure: 'REGISTRY_REVOKED',
    });
  });

  test('an on-the-wire credential tamper is caught after import', () => {
    const { eco, chain } = world();
    const artifacts = JSON.parse(exportChainArtifacts(chain, eco.trust)) as ChainArtifacts;
    const focus = artifacts.presentation.credentials[artifacts.presentation.focus]!;
    (focus.acdc.a as Record<string, unknown>)['agentDid'] = 'did:key:zEvilAgent';

    const imported = importVerifierContext(JSON.stringify(artifacts), eco.trust.trustedRoots);

    expect(verifyEcrChain(imported.presentation, imported.trust)).toEqual({
      ok: false,
      failure: 'SAID_MISMATCH',
    });
  });

  test('a tampered KEL inside the bundle is rejected at import', () => {
    const { eco, chain } = world();
    const artifacts = JSON.parse(exportChainArtifacts(chain, eco.trust)) as ChainArtifacts;
    const someAid = Object.keys(artifacts.kels)[0]!;
    const kel = artifacts.kels[someAid]! as { event: { s: string } }[];
    kel[0]!.event.s = 'f';

    expect(() => importVerifierContext(JSON.stringify(artifacts), eco.trust.trustedRoots)).toThrow();
  });

  test('a bundle verified against someone else’s root is refused', () => {
    const { eco, chain } = world();
    const wire = exportChainArtifacts(chain, eco.trust);

    const imported = importVerifierContext(wire, new Set(['E' + 'Q'.repeat(43)]));

    expect(verifyEcrChain(imported.presentation, imported.trust)).toEqual({
      ok: false,
      failure: 'ROOT_UNTRUSTED',
    });
  });
});
```

- [ ] **Step 2: 跑測試，確認 fail**

Run: `npx vitest run packages/vlei/test/portable.test.ts`
Expected: FAIL（portable.ts 不存在）

- [ ] **Step 3: `KelStore.kelOf` 與 `TelStore` 改造**

`packages/vlei/src/kel.ts` 的 `KelStore` 加：

```ts
  kelOf(aid: string): readonly SignedKelEvent[] | undefined {
    return this.kels.get(aid);
  }
```

`packages/vlei/src/tel.ts` 的 `TelStore` 改為以事件陣列為內部儲存：

```ts
export class TelStore {
  private readonly registries = new Map<string, readonly SignedTelEvent[]>();

  constructor(private readonly kels: KelStore) {}

  /** Live reference: later issue/revoke by the registry are visible. */
  register(registry: CredentialRegistry): void {
    this.registries.set(registry.registryId, registry.events);
  }

  /** For rebuilt contexts (portable bundles): raw event lists, verified on read. */
  registerEvents(registryId: string, events: readonly SignedTelEvent[]): void {
    this.registries.set(registryId, events);
  }

  eventsOf(registryId: string): readonly SignedTelEvent[] | undefined {
    return this.registries.get(registryId);
  }

  status(registryId: string, credentialSaid: string): CredentialStatus {
    const events = this.registries.get(registryId);
    if (events === undefined) return 'unknown';

    const inception = events[0]?.event;
    // The registry id is the vcp SAID; a mislabelled bundle proves nothing.
    if (inception === undefined || inception.i !== registryId) return 'unknown';
    const controllerAid = inception.ii;
    if (controllerAid === undefined) return 'unknown';

    let status: CredentialStatus = 'unknown';
    for (const signed of events) {
      if (!this.eventValid(controllerAid, signed)) return 'unknown';
      if (signed.event.t === 'iss' && signed.event.i === credentialSaid) status = 'issued';
      if (signed.event.t === 'rev' && signed.event.i === credentialSaid) status = 'revoked';
    }

    return status;
  }

  private eventValid(controllerAid: string, signed: SignedTelEvent): boolean {
    if (!this.kels.isAnchored(controllerAid, signed.event.d)) return false;

    const labels = signed.event.t === 'vcp' ? ['d', 'i'] : ['d'];
    if (!verifySaid(signed.event as unknown as Ked, labels)) return false;

    const state = this.kels.keyStateAt(controllerAid, signed.sigSeq);
    if (state === undefined) return false;

    return verifyThreshold(state, signed.sigs, utf8ToBytes(JSON.stringify(signed.event)));
  }
}
```

- [ ] **Step 4: 實作 `packages/vlei/src/portable.ts`**

```ts
/**
 * Portable chain artifacts — the PoC's stand-in for OOBI/CESR streams.
 *
 * A presentation travels as one JSON string carrying the ACDCs plus every KEL
 * and TEL a verifier needs. The only thing obtained out-of-band is the root
 * AID: import rebuilds fresh stores, re-verifying every KEL on registration
 * and every TEL event on read. Nothing in the bundle is trusted as-is.
 */

import { KelStore, type SignedKelEvent } from './kel.js';
import { TelStore, type SignedTelEvent } from './tel.js';
import type { VleiPresentation, VleiTrustContext } from './chain.js';

export interface ChainArtifacts {
  readonly presentation: VleiPresentation;
  readonly kels: Readonly<Record<string, readonly SignedKelEvent[]>>;
  readonly tels: Readonly<Record<string, readonly SignedTelEvent[]>>;
}

export function exportChainArtifacts(
  presentation: VleiPresentation,
  trust: VleiTrustContext,
): string {
  const kels: Record<string, readonly SignedKelEvent[]> = {};
  const tels: Record<string, readonly SignedTelEvent[]> = {};

  for (const signed of Object.values(presentation.credentials)) {
    if (signed === undefined) continue;

    const kel = trust.kels.kelOf(signed.acdc.i);
    if (kel === undefined) throw new Error('missing KEL for a credential issuer');
    kels[signed.acdc.i] = kel;

    const events = trust.tels.eventsOf(signed.acdc.ri);
    if (events === undefined) throw new Error('missing TEL for a credential registry');
    tels[signed.acdc.ri] = events;
  }

  return JSON.stringify({ presentation, kels, tels } satisfies ChainArtifacts);
}

export function importVerifierContext(
  serialized: string,
  trustedRoots: ReadonlySet<string>,
): { presentation: VleiPresentation; trust: VleiTrustContext } {
  const artifacts = JSON.parse(serialized) as ChainArtifacts;

  const kels = new KelStore();
  for (const kel of Object.values(artifacts.kels)) {
    kels.register(kel); // throws on any invalid KEL — nothing partial survives
  }

  const tels = new TelStore(kels);
  for (const [registryId, events] of Object.entries(artifacts.tels)) {
    tels.registerEvents(registryId, events);
  }

  return { presentation: artifacts.presentation, trust: { trustedRoots, kels, tels } };
}
```

`packages/vlei/src/index.ts` 追加：

```ts
export { exportChainArtifacts, importVerifierContext } from './portable.js';
export type { ChainArtifacts } from './portable.js';
```

- [ ] **Step 5: 跑測試 + 全套回歸 + commit**

Run: `npx vitest run && npm run typecheck && npm run demo:vlei`
Expected: 全 PASS、demo exit 0

```bash
git add packages/vlei
git commit -m "feat(vlei): portable chain artifacts replace in-process store sharing"
```

---

### Task 5: Demo 新步驟 + 文件收口

**Files:**
- Modify: `packages/vlei/demo/vleiCascade.ts`（+3 步）
- Modify: `packages/vlei/test/demo.test.ts`（步數與標籤斷言）
- Modify: `docs/vlei.md`（明文簡化清單改寫）
- Modify: `docs/vlei-defense.md`（Q1/Q3/Q9 更新）

- [ ] **Step 1: demo 測試先行（改斷言，必 fail）**

`packages/vlei/test/demo.test.ts` 第二個測試改為：

```ts
  test('the demo covers issuance, tampering, revocation and the QVI cascade', () => {
    const labels = runVleiDemo()
      .steps.map((step) => step.label)
      .join('|');

    expect(runVleiDemo().steps.length).toBeGreaterThanOrEqual(13);
    expect(labels).toContain('LEI');
    expect(labels).toContain('竄改');
    expect(labels).toContain('ECR 撤銷');
    expect(labels).toContain('QVI 撤銷');
    expect(labels).toContain('外來信任根');
    expect(labels).toContain('多簽');
    expect(labels).toContain('可攜出示包');
  });
```

Run: `npx vitest run packages/vlei/test/demo.test.ts`
Expected: FAIL（步數不足）

- [ ] **Step 2: `packages/vlei/demo/vleiCascade.ts` 插入三步**

import 區補：`exportChainArtifacts, importVerifierContext` 與 `type Acdc`（不需要 Acdc 可省）。在「// 4 — Tampering …」段之前插入：

```ts
  // 3b — The root itself is threshold multisig, like GLEIF's council-held root.
  steps.push(
    step(
      '信任根為門檻多簽',
      '2-of-3',
      `${eco.gleifKeyState.threshold}-of-${eco.gleifKeyState.keys.length}`,
    ),
  );

  // 3c — The presentation travels as one self-contained bundle; the verifier
  // rebuilds stores from the wire and only pins the root out-of-band.
  const wire = exportChainArtifacts(agentChain, eco.trust);
  const far = importVerifierContext(wire, eco.trust.trustedRoots);
  steps.push(
    step('可攜出示包跨驗證方驗證', 'ok', outcome(verifyEcrChain(far.presentation, far.trust))),
  );

  const wireTampered = JSON.parse(wire) as {
    presentation: { focus: string; credentials: Record<string, { acdc: { a: Record<string, unknown> } }> };
  };
  wireTampered.presentation.credentials[wireTampered.presentation.focus]!.acdc.a['agentDid'] =
    'did:key:zEvilAgent';
  const farTampered = importVerifierContext(
    JSON.stringify(wireTampered),
    eco.trust.trustedRoots,
  );
  steps.push(
    step(
      '可攜出示包線上竄改被攔截',
      'SAID_MISMATCH',
      outcome(verifyEcrChain(farTampered.presentation, farTampered.trust)),
    ),
  );
```

Run: `npx vitest run packages/vlei/test/demo.test.ts && npm run demo:vlei`
Expected: PASS、demo 14 行 ✓、exit 0

- [ ] **Step 3: `docs/vlei.md` 明文簡化清單改寫**

原五條整段換成：

```markdown
## 明文簡化與已補實項（PoC）

1. ~~單簽 KEL~~ → **已支援 kt 門檻多簽**（GLEIF root 為 2-of-3）；witness 與 delegated AID 仍未實作。
2. ~~KEL/TEL 以 in-process store 共享~~ → **可攜出示包**：出示以單一 JSON（credentials + KELs + TELs）傳遞，
   驗證方僅需帶外釘選 root AID，匯入時全部重驗；CESR stream framing 仍未實作。
3. Schema SAID 為本 repo 自算，非 GLEIF 登錄之官方 SAID（接軌路徑見 defense Q2）。
4. ~~偷到舊金鑰可偽簽舊 seq~~ → **TEL 事件已錨定控制者 KEL**：每個 vcp/iss/rev 先以現行金鑰
   在 KEL 寫入 seal（ixn）再簽發；偽簽者無法用舊金鑰延長 KEL 補錨，未錨定事件 fail-closed。
5. 所有 LEI 由 `syntheticLei()` 產生（tag + X 填充 + 合法檢查碼），明顯為合成值。
```

- [ ] **Step 4: `docs/vlei-defense.md` 更新**

- **Q3** 全段換成：

```markdown
### Q3. 金鑰輪替後，偷到舊金鑰的人可以偽簽舊序號的憑證嗎？

已封死。每個 TEL 事件（vcp/iss/rev）在簽發前都由**現行金鑰**在控制者 KEL 寫入
seal（ixn 互動事件）；驗證方對每個 TEL 事件都要求錨存在。偷到舊金鑰的人可以
偽造事件本體與舊 seq 簽章，但無法在不持有現行金鑰的情況下延長 KEL 補錨——
未錨定事件一律 fail-closed 為 unknown。加上 pre-rotation（下一把金鑰的承諾寫在
前一個事件裡），現行金鑰與歷史兩個方向都由 KEL 封鎖。

**證據**：`packages/vlei/test/tel.test.ts`（a validly-signed but unanchored event
fails closed）；`packages/vlei/test/kel.test.ts`（anchoring / pre-rotation 系列）。
```

- **Q1** 證據行改為：`**證據**：\`packages/vlei/test/\`（全套測試，含多簽、錨定、可攜出示包）；\`npm run demo:vlei\`。`
- **Q9** 中「49 測試 1.4 秒」改為「全套 vlei 測試數秒內完成」（避免數字過期）。

- [ ] **Step 5: 全套回歸 + commit**

```bash
npx vitest run
npm run typecheck
npm run demo:vlei
git add packages/vlei docs/vlei.md docs/vlei-defense.md
git commit -m "feat(vlei): demo and docs for multisig root, anchoring and portable bundles"
```

---

## Self-Review

**1. Spec coverage** — 三項 hardening 各有實作＋測試＋demo＋文件收口：多簽（Task 1+3）、錨定（Task 2）、可攜出示包（Task 4）；docs/vlei.md 簡化清單與 defense Q1/Q3/Q9 在 Task 5 收口。橋接層不動的承諾由 Global Constraints 鎖定（`VleiPresentation`/`verify*Chain`/`Ecosystem` 介面不變）。

**2. Placeholder scan** — 各 task 均含完整測試碼與實作碼；Task 1 為 kel.ts 全檔重寫、Task 2 為精確函式級替換、Task 4 含 TelStore 全類別替換。無 TBD。

**3. Type consistency** — `KeyState{keys,threshold}`、`verifyThreshold(state,sigs,data)`、`keyStateAt`、`sigs` 欄位在 Task 1/2/4 一致；`anchor(said)`/`isAnchored(aid,said)` 在 Task 2 定義、Task 4 的 TelStore 使用；`gleifKeyState` 在 Task 3 定義、Task 5 demo 使用；`exportChainArtifacts`/`importVerifierContext` 在 Task 4 定義、Task 5 demo 與測試使用。已知需留意點：Task 2 將 `KelEvent.k` 等改為 optional 後,chain/acdc 對 `event.k` 無直接引用（僅 kel.ts 內部），typecheck 會把漏網揪出。
