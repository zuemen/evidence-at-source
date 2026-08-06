# L1 vLEI 結構強制 ＋ Track 05／06 能力接進產品 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 L1 憑證層跟 L0 一樣「不可能繞過 vLEI」，並把四項只活在測試裡的 Track 05／06 能力接到 Agent 與線上 demo 上。

**Architecture:** 兩個獨立可交付的階段。Phase A 把「簽發者公鑰必須來自已驗證的法人 vLEI 鏈」從**慣例**變成**執行期強制**——`resolveIssuerSigningKey` 回傳帶模組私有 symbol 的金鑰，`checkCredentialLayer` 檢查該標記，裸 JWK 一律回新原因碼 `ISSUER_VLEI_MISSING`。Phase B 把申辦監測、RBA 項目分類、查驗收據與撤銷反向通知從 library 接進 Agent 介面與稽核台畫面。Phase C 讓文件反映實際接線位置。

**Tech Stack:** TypeScript、Node 22、vitest 4、React 18 + Vite、`jose`、`@eas/vlei`（repo 內 KERI/ACDC 實作）

## Global Constraints

- **語言慣例**：文件／README／Markdown 內文一律**繁體中文**；程式碼註解、變數名、函式名、commit message 一律**英文**。
- **CLAUDE.md 三原則不可違反**：(1) 禁用函式不得存在於程式碼中（`approveAccount`／`rejectAccount`／`freezeAccount`／`transferFunds`／`readTransactionHistory`）(2) 只回布林／匯總 (3) 全合成資料。
- **不得加入繞過 Policy Gate 的測試後門**——沒有 `SKIP_POLICY_GATE`、沒有 `NODE_ENV === 'test'` 放行、沒有 `bypassGate` 參數。本計畫的品牌金鑰**不得**提供 test-only 建構子；測試一律走真實 vLEI 鏈。
- **不得改動 `poc/` 下兩支腳本的邏輯**。
- **不得自行擴充憑證欄位**——四張憑證的欄位定義在 `docs/credentials.md`，本計畫完全不動憑證欄位。
- **新增原因碼須為 SCREAMING_SNAKE_CASE 且語意自明**，並先確認既有清單無涵蓋者（見 `CLAUDE.md` 原因碼表）。本計畫只新增一枚：`ISSUER_VLEI_MISSING`。
- **不得在錯誤訊息裡洩漏被隱藏的欄位值**。
- **不新增 npm 依賴**。
- **vitest 只吃 `packages/*/test/**/*.test.ts`**（`vitest.config.ts:22`）。
- 每個 Task 結束前 `npm test` 與 `npm run typecheck` 都必須乾淨。
- `packages/shared/test/docsConsistency.test.ts` 會檢查 README／governance-memo／slides 宣稱的測試數與測試檔數、以及 README 每一條路徑引用——**本計畫每次增減測試都必須同步更新那三份文件的數字**，否則測試轉紅。

## 基準事實（本計畫撰寫時實測，2026-08-06）

| 事實 | 實測值 | 驗證方式 |
|---|---|---|
| 測試總數 | **243** | `npm test` |
| `packages/agents/test/*.test.ts` 檔數 | **26** | `ls packages/agents/test/*.test.ts \| wc -l` |
| `resolveIssuerSigningKey` 在 `packages/agents/src/` 的呼叫次數 | **0** | 只有 `vleiBridge.ts` 定義、`index.ts` 再匯出 |
| L1 唯一取金鑰的正確接線 | `packages/web/src/demo/world.ts:319-324` `requireIssuerKey` | 慣例，非結構 |
| 產品程式碼呼叫 `createApplicationMonitor`／`issueVerificationReceipt`／`createVerificationLog`／`classifyRbaItem` 的次數 | **各 0** | grep `packages/web/src` 與三個 agent 檔 |
| `bankAgent.assess(facts, risk?)` 是否已支援風險訊號 | **已支援**（`bankAgent.ts:36`、`:67`） | 只差沒人傳 |
| `createVleiIssuer` 是否支援 `IssuerOptions` | **支援**（`issuer.ts:113`、`:132`） | 測試遷移為機械式 |
| 使用 `createIssuer`（無鏈）發證的測試檔 | **9 個** | credentialLayer／expiry／revocation／revocationPaths／scenarioT8／scenarioT10／endToEnd／issuerTierGate／zkReconciliation |

## 階段獨立性

Phase A 與 Phase B 互不相依，各自都是可交付、可回退的完整改動。若時間只夠做一個：**Phase B 對決選配分的邊際效益較高**（把四項命題答案從「測試裡有」變成「畫面上按得到」，直接命中場景契合度 35% 與簡報 25%）；Phase A 補的是論述一致性的破口（評審 grep 會發現 L0 是結構保證、L1 是慣例）。順序上先做 A，因為它改動 `Submission` 型別，先做可避免 B 的新程式碼寫完再改一次。

## 不在本計畫範圍

- ZK 真實電路接線（本機無 circom／Rust 工具鏈，維持 `stubProofVerifier = () => false` 的誠實降級）。
- 8/15、8/22 工作坊公布正式命題後的對照表重做（另立計畫）。
- 5 分鐘展示影片錄製。

---

## File Structure

| 檔案 | 建立／修改 | 責任 |
|---|---|---|
| `packages/shared/src/reasonCodes.ts` | 修改 | 新增 `ISSUER_VLEI_MISSING`（L1） |
| `packages/agents/src/vleiBridge.ts` | 修改 | 新增品牌型別 `IssuerSigningKey`、標記工廠、`requireIssuerSigningKey`；`resolveIssuerSigningKey` 改回傳品牌金鑰。維持「KERI/ACDC 世界與 SD-JWT 世界之間唯一的門」這個既有責任 |
| `packages/agents/src/credentialLayer.ts` | 修改 | L1 入口改收 `IssuerSigningKey` 並在執行期驗標記 |
| `packages/agents/src/cohort.ts` | 修改 | `Submission.issuerPublicKey` 型別跟進 |
| `packages/agents/src/zkReconciliation.ts` | 修改 | 綁定檢查用的金鑰型別跟進 |
| `packages/agents/src/brandAgent.ts` | 修改 | 新增 `answerRbaItem`（題06 Q3）與 `issueReceipt`／`revocationNotices`（題06 Q4／Q5） |
| `packages/agents/test/helpers/vleiWorld.ts` | 修改 | 新增 `setupIssuerWorld()`，讓 9 個測試檔的遷移是一行 |
| `packages/agents/test/issuerKeyProvenance.test.ts` | 建立 | 唯一責任：裸 JWK 不得通過 L1（Phase A 的守門測試） |
| `packages/agents/test/rbaItemQuery.test.ts` | 建立 | `answerRbaItem` 的行為 |
| `packages/agents/test/receiptFlow.test.ts` | 建立 | 查驗收據簽發→驗簽→撤銷反向通知的串接 |
| `packages/web/src/demo/world.ts` | 修改 | 接上申辦監測、RBA 查詢、收據與撤銷通知；`requireIssuerKey` 改用 agents 匯出的版本 |
| `packages/web/src/views/ConsoleView.tsx` | 修改 | 三個新面板：風險旗標、RBA 項目分類、查驗收據與撤銷通知 |
| `README.md`／`docs/governance-memo.md`／`packages/web/public/slides.html` | 修改 | 測試數同步；命題對照表的「可執行證據」從測試檔改為 demo 位置 |

---

# Phase A — L1 結構強制 vLEI

### Task A1: 簽發者金鑰的來源證明

現況：`checkCredentialLayer` 收一個裸 `PublicJwk`，誰塞什麼都算數。`resolveIssuerSigningKey`（把金鑰從已驗證的法人 vLEI 鏈取出）在 `packages/agents/src/` 裡**呼叫次數為 0**——只有 demo 的 `world.ts:321` 有做對，那是慣例不是保證。這與 L0 形成不對稱：`delegationGate.ts:98-99` 缺 vLEI 直接 `AGENT_VLEI_MISSING`，無從繞過。

本專案的整個論點是「保證寫在結構裡」（CLAUDE.md 原則一：禁用函式不是被擋掉，是不存在）。L1 這個洞是全 repo 相對於自身標準最可攻擊的一處。

**設計決定**：用**執行期品牌**而非純型別 brand。純型別只要一個 `as` 就破功，且型別錯誤無法用 vitest 斷言。品牌金鑰帶一個模組私有的 `Symbol()`，只有 `resolveIssuerSigningKey` 產得出來——這不是後門的相反面，而是與 CLAUDE.md「不得加入測試後門」一致：**測試也必須走真實鏈**。

**Files:**
- Modify: `packages/shared/src/reasonCodes.ts`
- Modify: `packages/agents/src/vleiBridge.ts`
- Modify: `packages/agents/src/credentialLayer.ts:21-34`（`CredentialLayerInput`）與 `:65-82`
- Modify: `packages/agents/src/cohort.ts:16-21`（`Submission`）
- Modify: `packages/agents/src/zkReconciliation.ts`
- Modify: `packages/agents/test/helpers/vleiWorld.ts`
- Create: `packages/agents/test/issuerKeyProvenance.test.ts`
- Modify: 9 個測試檔（見 Step 7）
- Modify: `packages/web/src/demo/world.ts:319-324`
- Modify: `README.md`、`docs/governance-memo.md`、`packages/web/public/slides.html`（測試數）

**Interfaces:**
- Consumes: `verifyLeChain`、`VleiPresentation`、`VleiTrustContext`（`@eas/vlei`，已存在）
- Produces:
  - `export type IssuerSigningKey`（品牌型別，`packages/agents/src/vleiBridge.ts`）
  - `export function resolveIssuerSigningKey(presentation: VleiPresentation, trust: VleiTrustContext): IssuerIdentityResult`——`issuer.jwk` 型別由 `PublicJwk` 改為 `IssuerSigningKey`
  - `export function requireIssuerSigningKey(presentation: VleiPresentation, trust: VleiTrustContext): IssuerSigningKey`——鏈被拒時 `throw new Error`
  - `CredentialLayerInput.issuerPublicKey: IssuerSigningKey`
  - `Submission.issuerPublicKey: IssuerSigningKey`
  - 新原因碼 `'ISSUER_VLEI_MISSING'`
  - 測試 helper `setupIssuerWorld(options?: IssuerOptions): Promise<IssuerWorld>`

- [ ] **Step 1: 寫下會失敗的測試**

建立 `packages/agents/test/issuerKeyProvenance.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { bootstrapEcosystem } from '@eas/vlei';
import { createVleiIssuer } from '@eas/issuer';
import {
  checkCredentialLayer,
  requireIssuerSigningKey,
  type IssuerSigningKey,
} from '@eas/agents';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';

const WORKER_DID = 'did:key:zWorker001';

async function issuedCredential() {
  const eco = bootstrapEcosystem();
  const factory = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
  });
  const worker = await generateKeyPair();
  const credential = await factory.issue('WorkingHoursCredential', {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
  });

  return {
    eco,
    factory,
    worker,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
    attestation: await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-001',
    }),
  };
}

describe('layer 1 accepts only issuer keys that arrived through a verified chain', () => {
  test('a key taken straight off the issuer is refused, however genuine it is', async () => {
    const { factory, worker, presentation, attestation } = await issuedCredential();

    // The very key the credential was signed with — but with no chain behind it.
    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: factory.publicKey as unknown as IssuerSigningKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision).toEqual({ ok: false, reason: 'ISSUER_VLEI_MISSING' });
  });

  test('the same key admitted through the legal-entity chain is accepted', async () => {
    const { eco, factory, worker, presentation, attestation } = await issuedCredential();

    const decision = await checkCredentialLayer({
      presentation,
      attestation,
      issuerPublicKey: requireIssuerSigningKey(factory.legalEntityPresentation(), eco.trust),
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);
  });

  test('requireIssuerSigningKey throws rather than returning an unusable key', async () => {
    const { factory } = await issuedCredential();
    const foreign = bootstrapEcosystem();

    // A chain presented against a root that never signed it.
    expect(() => requireIssuerSigningKey(factory.legalEntityPresentation(), foreign.trust)).toThrow(
      /ISSUER_VLEI_CHAIN_INVALID/,
    );
  });
});
```

- [ ] **Step 2: 跑測試，確認它以正確的理由失敗**

執行：`npx vitest run packages/agents/test/issuerKeyProvenance.test.ts`

預期：三個 test 全部 FAIL。第一個與第三個因為 `requireIssuerSigningKey` 尚未匯出而在 import 階段就失敗（訊息形如 `does not provide an export named 'requireIssuerSigningKey'`）。這是正確的失敗理由。

- [ ] **Step 3: 新增原因碼**

`packages/shared/src/reasonCodes.ts`，在既有的 `'ISSUER_VLEI_CHAIN_INVALID',` 那一行**之前**插入一行：

```ts
  'ISSUER_VLEI_MISSING',
```

命名理由：與 L0 的 `AGENT_VLEI_MISSING` 同族——「根本沒出示鏈」與「出示了但驗不過（`ISSUER_VLEI_CHAIN_INVALID`）」是兩件事，讀到就知道差別，不需查表。

- [ ] **Step 4: 在 vleiBridge 加入品牌金鑰與 require 版本**

`packages/agents/src/vleiBridge.ts`，把 `IssuerIdentity` 介面**之前**的位置加入品牌型別，並改寫 `IssuerIdentity` 與 `resolveIssuerSigningKey`，最後追加 `requireIssuerSigningKey`。

在 `import type { PublicJwk, ReasonCode } from '@eas/shared';` 之後加入：

```ts
/**
 * A signing key that is known to have arrived through a verified Legal Entity
 * vLEI chain. The marker is a module-private symbol, so the only way to obtain
 * a value of this type is to call resolveIssuerSigningKey and have the chain
 * verify — a bare JWK cannot be cast into one at runtime, and layer 1 checks
 * for the marker rather than trusting its caller.
 *
 * There is deliberately no test-only constructor: CLAUDE.md forbids gate
 * backdoors, so tests build a real chain like everything else does.
 */
const CHAIN_VERIFIED = Symbol('vlei.chainVerified');

export type IssuerSigningKey = PublicJwk & { readonly [CHAIN_VERIFIED]: true };

function admitIssuerKey(jwk: PublicJwk): IssuerSigningKey {
  return Object.freeze({ ...jwk, [CHAIN_VERIFIED]: true as const }) as IssuerSigningKey;
}

/** Layer 1 asks this before it will use a key at all. */
export function isChainVerifiedKey(key: PublicJwk): key is IssuerSigningKey {
  return (key as Partial<IssuerSigningKey>)[CHAIN_VERIFIED] === true;
}
```

把 `IssuerIdentity` 的 `jwk` 欄位型別改掉——找到：

```ts
export interface IssuerIdentity {
  readonly didWeb: string;
  readonly legalName: string;
  readonly lei: string;
  readonly jwk: PublicJwk;
}
```

改成：

```ts
export interface IssuerIdentity {
  readonly didWeb: string;
  readonly legalName: string;
  readonly lei: string;
  readonly jwk: IssuerSigningKey;
}
```

在 `resolveIssuerSigningKey` 內，把：

```ts
      jwk: facts.credentialSigningJwk as PublicJwk,
```

改成：

```ts
      jwk: admitIssuerKey(facts.credentialSigningJwk as PublicJwk),
```

在檔案最末追加：

```ts
/**
 * The throwing form, for call sites that have no meaningful way to continue
 * without the key (demo wiring, tests). Failing loudly is correct here: a
 * caller that swallowed this would be back to trusting an unverified key.
 */
export function requireIssuerSigningKey(
  presentation: VleiPresentation,
  trust: VleiTrustContext,
): IssuerSigningKey {
  const resolved = resolveIssuerSigningKey(presentation, trust);
  if (!resolved.ok) throw new Error(`issuer vLEI chain rejected: ${resolved.reason}`);

  return resolved.issuer.jwk;
}
```

- [ ] **Step 5: 讓 L1 在執行期強制檢查標記**

`packages/agents/src/credentialLayer.ts`。

在 import 區塊，把：

```ts
import {
  base64urlToUtf8,
  credentialHash,
  meetsMinimumTier,
  verifyPairing,
  verifyPresentation,
  type IssuerTier,
  type PublicJwk,
  type ReasonCode,
  type RevocationRegistry,
} from '@eas/shared';
```

改成：

```ts
import {
  base64urlToUtf8,
  credentialHash,
  meetsMinimumTier,
  verifyPairing,
  verifyPresentation,
  type IssuerTier,
  type PublicJwk,
  type ReasonCode,
  type RevocationRegistry,
} from '@eas/shared';
import { isChainVerifiedKey, type IssuerSigningKey } from './vleiBridge.js';
```

把 `CredentialLayerInput` 的：

```ts
  readonly issuerPublicKey: PublicJwk;
```

改成：

```ts
  /** Only obtainable from resolveIssuerSigningKey — see vleiBridge.ts. */
  readonly issuerPublicKey: IssuerSigningKey;
```

在 `checkCredentialLayer` 函式體最開頭（`let payload: Record<string, unknown>;` 之前）插入：

```ts
  // On whose authority: the key must have come through a verified Legal Entity
  // chain. Checked at runtime, not just in the types, so that a cast cannot
  // reintroduce a configuration-trusted key.
  if (!isChainVerifiedKey(input.issuerPublicKey as PublicJwk)) {
    return { ok: false, reason: 'ISSUER_VLEI_MISSING' };
  }
```

- [ ] **Step 6: 型別跟進 cohort 與 zkReconciliation**

`packages/agents/src/cohort.ts`，把 `Submission` 的：

```ts
  readonly issuerPublicKey: PublicJwk;
```

改成：

```ts
  readonly issuerPublicKey: IssuerSigningKey;
```

並在該檔 import 區塊追加：

```ts
import type { IssuerSigningKey } from './vleiBridge.js';
```

`packages/agents/src/zkReconciliation.ts:36`，把：

```ts
  readonly issuerPublicKey: PublicJwk;
```

改成：

```ts
  readonly issuerPublicKey: IssuerSigningKey;
```

並在該檔 `import { credentialHash, type PublicJwk, ... } from '@eas/shared';`（`:20`）之後追加：

```ts
import type { IssuerSigningKey } from './vleiBridge.js';
```

`:37` 的 `workerPublicKey: PublicJwk` **維持不變**——勞工不在 vLEI 體系內，把它也品牌化是錯的。`:71-72` 只是把兩者傳給 `checkCredentialLayer`，不需修改。

- [ ] **Step 7: 匯出新符號**

`packages/agents/src/index.ts:80-90`。把：

```ts
export {
  resolveAgentAuthority,
  resolveIssuerSigningKey,
} from './vleiBridge.js';
export type {
  AgentAuthority,
  AgentAuthorityResult,
  IssuerIdentity,
  IssuerIdentityResult,
} from './vleiBridge.js';
```

改成：

```ts
export {
  isChainVerifiedKey,
  requireIssuerSigningKey,
  resolveAgentAuthority,
  resolveIssuerSigningKey,
} from './vleiBridge.js';
export type {
  AgentAuthority,
  AgentAuthorityResult,
  IssuerIdentity,
  IssuerIdentityResult,
  IssuerSigningKey,
} from './vleiBridge.js';
```

- [ ] **Step 8: 擴充測試 helper，讓 9 個檔的遷移是一行**

`packages/agents/test/helpers/vleiWorld.ts`，在檔案末端追加：

```ts
import type { IssuerOptions } from '@eas/issuer';
import { requireIssuerSigningKey, type IssuerSigningKey } from '@eas/agents';

export interface IssuerWorld {
  readonly eco: Ecosystem;
  readonly issuer: VleiIssuer;
  /** The issuer's signing key, admitted through its Legal Entity chain. */
  readonly issuerKey: IssuerSigningKey;
}

/**
 * A factory issuer with a real vLEI chain behind it. Tests that only care about
 * expiry, revocation or tier still have to go through the chain, because layer 1
 * has no other way in — which is the point.
 */
export async function setupIssuerWorld(options?: IssuerOptions): Promise<IssuerWorld> {
  const eco = bootstrapEcosystem();
  const issuer = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
    ...(options === undefined ? {} : { options }),
  });

  return { eco, issuer, issuerKey: requireIssuerSigningKey(issuer.legalEntityPresentation(), eco.trust) };
}
```

`IssuerOptions` 已由 `packages/issuer/src/index.ts` 匯出，不需另外處理。

- [ ] **Step 9: 遷移 9 個測試檔**

對下列每一個檔案做同樣的機械替換：

```
packages/agents/test/credentialLayer.test.ts
packages/agents/test/expiry.test.ts
packages/agents/test/revocation.test.ts
packages/agents/test/revocationPaths.test.ts
packages/agents/test/scenarioT8.test.ts
packages/agents/test/scenarioT10.test.ts
packages/agents/test/endToEnd.test.ts
packages/agents/test/issuerTierGate.test.ts
packages/agents/test/zkReconciliation.test.ts
```

替換規則（三條，逐檔套用）：

1. 把 `import { createIssuer } from '@eas/issuer';` 改為 `import { setupIssuerWorld } from './helpers/vleiWorld.js';`（若該檔同時用到 `@eas/issuer` 的其他符號則保留該 import，只移除 `createIssuer`）。
2. 把 `const factory = await createIssuer('did:web:factory.example', OPTS);`（變數名依各檔而異，可能是 `factory`／`agency`／`issuer`）改為：
   ```ts
   const world = await setupIssuerWorld(OPTS);
   const factory = world.issuer;
   ```
   其中 `OPTS` 原樣保留；若原本沒有第二個參數，改為 `await setupIssuerWorld()`。
3. 把 `issuerPublicKey: factory.publicKey` 改為 `issuerPublicKey: world.issuerKey`。

**逐檔驗證**：每改完一個檔案就跑該檔，再改下一個——不要九個一起改完才跑。

```bash
npx vitest run packages/agents/test/credentialLayer.test.ts
```

預期：PASS。若某檔因為需要**兩個不同簽發者**（例如 `scenarioT10.test.ts` 的工廠與銀行交叉對帳）而無法用單一 `setupIssuerWorld()`，就在該檔內直接用 `bootstrapEcosystem()` ＋ 兩次 `createVleiIssuer`（`leiTag` 分別為 `FACTORYEXAMPLE` 與 `BANKEXAMPLE`），並各自以 `requireIssuerSigningKey(issuer.legalEntityPresentation(), eco.trust)` 取金鑰——**兩個法人必須掛在同一個 `eco` 之下**，否則彼此的鏈驗不過。

- [ ] **Step 10: 讓 demo 改用共用的 require 版本**

`packages/web/src/demo/world.ts`，刪除 `:319-324` 的本地實作：

```ts
  /** L1 only ever sees issuer keys that arrived through a verified LE chain. */
  function requireIssuerKey(issuer: VleiIssuer): PublicJwk {
    const resolved = resolveIssuerSigningKey(issuer.legalEntityPresentation(), eco.trust);
    if (!resolved.ok) throw new Error(`issuer vLEI chain rejected: ${resolved.reason}`);
    return resolved.issuer.jwk;
  }
```

改成：

```ts
  /** Layer 1 now refuses any other kind of key; this is just the ergonomics. */
  function requireIssuerKey(issuer: VleiIssuer): IssuerSigningKey {
    return requireIssuerSigningKey(issuer.legalEntityPresentation(), eco.trust);
  }
```

並把該檔 import 的 `resolveIssuerSigningKey` 換成 `requireIssuerSigningKey`，型別匯入補 `type IssuerSigningKey`。若 `PublicJwk` 在該檔已無其他用途則一併移除該匯入。

- [ ] **Step 11: 跑全部測試與 typecheck**

執行：`npm test`
預期：`Tests 246 passed (246)`（243 ＋ 本 Task 新增 3 個）。若數字不同，以實測為準並用於 Step 12。

執行：`npm run typecheck`
預期：無輸出。

- [ ] **Step 12: 同步文件數字**

守門測試會檢查這三處。把 `243` 全部改為 Step 11 實測到的數字（預期 246），把 `26 個測試檔` 改為 `27 個測試檔`：

- `README.md` 的 `npm test         # vitest，目前 243 個測試全綠`
- `README.md` 的 `| 程式碼 | 本 repo（CI 每次 push 跑 243 tests + \`demo:vlei\` 閘門） |`
- `docs/governance-memo.md` 的 `跑 243 個測試`
- `docs/governance-memo.md` 的 `26 個測試檔`
- `packages/web/public/slides.html` 的 `<strong>243 個測試</strong>`

- [ ] **Step 13: 在治理說明補上這條保證**

`docs/governance-memo.md` 第 4 節（Policy Gate），把：

```
（簽章／反簽配對／撤銷／層級／產線綁定）
```

改成：

```
（簽章／反簽配對／撤銷／層級／產線綁定；簽發者公鑰只能來自已驗證的法人 vLEI 鏈，裸金鑰回 `ISSUER_VLEI_MISSING`）
```

- [ ] **Step 14: 跑測試並 Commit**

執行：`npm test` 與 `npm run typecheck`，皆須乾淨。

```bash
git add packages/shared/src/reasonCodes.ts packages/agents/src packages/agents/test packages/web/src/demo/world.ts README.md docs/governance-memo.md packages/web/public/slides.html
git commit -m "feat(gate): layer 1 accepts only chain-verified issuer keys"
```

---

# Phase B — 四項 Track 05／06 能力接進產品

### Task B1: 跨機構申辦監測接上銀行 Agent（題05）

`createApplicationMonitor` 有實作、有測試，但產品程式碼呼叫次數為 0。而 `bankAgent.assess(facts, risk?)` **早就準備好收風險訊號**（`bankAgent.ts:36`、`:67` 產生 `MULTIPLE_APPLICATIONS` 旗標），只是沒人傳。這是四項裡接線成本最低、命題命中最直接的一項：Track 05 的「被冒名利用」正是人頭帳戶指紋。

**Files:**
- Modify: `packages/web/src/demo/world.ts`
- Modify: `packages/web/src/views/ConsoleView.tsx`

**Interfaces:**
- Consumes: `createApplicationMonitor(options?: { threshold?: number }): ApplicationMonitor`（`record(workerDid)`／`risk(workerDid): { count, flagged }`）、`createBankAgent().assess(facts, risk?)`
- Produces: `SplitView['bank']` 新增 `riskFlags: readonly string[]`

- [ ] **Step 1: 在 demo world 建立監測器並餵入申辦事件**

`packages/web/src/demo/world.ts`：

在 import 區塊的 `createBankAgent,` 之後加入 `createApplicationMonitor,`。

在 `const revocations: RevocationRegistry = createRevocationRegistry();` 之後加入：

```ts
  // 題05 Q3: the mule-account fingerprint is one identity applying at several
  // institutions in a short window. The monitor only ever answers "over the
  // threshold or not" — never where the applications went.
  const applications = createApplicationMonitor();
  // Synthetic history: this worker has already applied at four institutions.
  for (let i = 0; i < 4; i += 1) applications.record(WORKER_DID);
```

- [ ] **Step 2: 把風險訊號傳進 assess**

同檔 `split()` 內，把：

```ts
            ? createBankAgent().assess({
                feeWithinLegalCap: disclosed['feeWithinLegalCap'] as boolean | undefined,
                passportHeldByWorker: disclosed['passportHeldByWorker'] as boolean | undefined,
                nativeLanguageVersionProvided: disclosed['nativeLanguageVersionProvided'] as
                  | boolean
                  | undefined,
              })
```

改成：

```ts
            ? createBankAgent().assess(
                {
                  feeWithinLegalCap: disclosed['feeWithinLegalCap'] as boolean | undefined,
                  passportHeldByWorker: disclosed['passportHeldByWorker'] as boolean | undefined,
                  nativeLanguageVersionProvided: disclosed['nativeLanguageVersionProvided'] as
                    | boolean
                    | undefined,
                },
                { flagged: applications.risk(WORKER_DID).flagged },
              )
```

只傳 `flagged`，不傳 `count`——`ApplicationRiskSignal` 的型別就只有 `flagged`，次數留在監測器內部不外流。

- [ ] **Step 3: 在稽核台顯示風險旗標**

`packages/web/src/views/ConsoleView.tsx`，在銀行側呈現 `assessment` 的區塊內、`recommendation` 之後，加入：

```tsx
{split.bank.assessment !== null && split.bank.assessment.riskFlags.length > 0 && (
  <div
    style={{
      marginTop: '0.6rem',
      padding: '0.5rem 0.7rem',
      border: '1px solid var(--amber, #d59a3c)',
      borderRadius: '4px',
      fontSize: '0.85rem',
    }}
  >
    <strong>風險旗標：{split.bank.assessment.riskFlags.join('、')}</strong>
    <div style={{ opacity: 0.75, marginTop: '0.25rem' }}>
      同一身分短期在多家機構申辦。旗標只提供人類覆核參考，Agent 不據此做任何決定，
      也拿不到申辦去向。
    </div>
  </div>
)}
```

插入位置：`ConsoleView.tsx:197` 開始的 `{split.bank.assessment !== null && split.bank.assessment.reasons.length > 0 && (` 區塊**結束之後**，仍在同一個銀行側容器內。該檔既有寫法就是 `split.bank.assessment?.recommendation`（`:174`）與 `split.bank.assessment.reasons`（`:199`），上面的程式碼與其一致。

- [ ] **Step 4: 驗證**

執行：`npm run typecheck`
預期：無輸出。

執行：`npm test`
預期：`Tests 246 passed (246)`（本 Task 不新增測試——行為已由 `applicationMonitor.test.ts` 與 `bankAgent.test.ts` 覆蓋，本 Task 只做接線）。

執行：

```bash
npm run build --workspace @eas/web
npm run preview --workspace @eas/web -- --port 4173
```

開啟 `http://localhost:4173/`，切到稽核台、按「一鍵導覽」或執行 SplitDemo。
預期：銀行側出現「風險旗標：MULTIPLE_APPLICATIONS」。看完 Ctrl+C。

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/demo/world.ts packages/web/src/views/ConsoleView.tsx
git commit -m "feat(demo): surface the cross-institution application flag to the reviewer"
```

---

### Task B2: RBA 項目分類接上品牌 Agent（題06 Q3）

`classifyRbaItem` 目前只有測試在用。它回答的是「哪些 RBA 項目可以用憑證回答、哪些必須實地稽核」——這是題06 Q3 的直接答案，而且是一個**誠實性主張**：系統明說自己不能取代什麼。現在沒有任何 Agent 介面暴露它，評審在畫面上看不到。

**Files:**
- Modify: `packages/agents/src/brandAgent.ts`
- Create: `packages/agents/test/rbaItemQuery.test.ts`
- Modify: `packages/web/src/demo/world.ts`
- Modify: `packages/web/src/views/ConsoleView.tsx`

**Interfaces:**
- Consumes: `classifyRbaItem(item: string): RbaItemClass | 'UNKNOWN'`、既有原因碼 `REQUIRES_ONSITE_AUDIT`、`CLAIM_NOT_DISCLOSED`
- Produces:
  - `export type RbaItemAnswer = { ok: true; item: string; answerable: true } | { ok: false; reason: ReasonCode }`
  - `BrandAgent.answerRbaItem(item: string): RbaItemAnswer`
  - `DemoSnapshot`／`SplitView` 之外的獨立欄位 `rbaItems: readonly { item: string; verdict: string }[]`

- [ ] **Step 1: 寫下會失敗的測試**

建立 `packages/agents/test/rbaItemQuery.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { createBrandAgent } from '@eas/agents';

const agent = createBrandAgent([]);

describe('the brand agent answers which RBA items a credential can settle', () => {
  test('a credential-answerable item is accepted', () => {
    expect(agent.answerRbaItem('workingHoursWithinLimit')).toEqual({
      ok: true,
      item: 'workingHoursWithinLimit',
      answerable: true,
    });
  });

  test('an on-site item is refused specifically, not generically', () => {
    expect(agent.answerRbaItem('dormitoryLivingConditions')).toEqual({
      ok: false,
      reason: 'REQUIRES_ONSITE_AUDIT',
    });
  });

  test('an unlisted item is refused rather than quietly answered', () => {
    expect(agent.answerRbaItem('somethingNobodyClassified')).toEqual({
      ok: false,
      reason: 'CLAIM_NOT_DISCLOSED',
    });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

執行：`npx vitest run packages/agents/test/rbaItemQuery.test.ts`
預期：三個 test 皆 FAIL，訊息形如 `agent.answerRbaItem is not a function`。

- [ ] **Step 3: 實作 answerRbaItem**

`packages/agents/src/brandAgent.ts`：

在 import 區塊追加：

```ts
import { classifyRbaItem } from './rbaItems.js';
```

在 `export type EvidenceIntegrityAnswer` 之後加入型別：

```ts
/**
 * 題06 Q3 — the honest half of the answer. Saying "this one needs a human on
 * the floor" is a stronger claim than a generic refusal, and an unlisted item
 * is refused rather than guessed at.
 */
export type RbaItemAnswer =
  | { readonly ok: true; readonly item: string; readonly answerable: true }
  | { readonly ok: false; readonly reason: ReasonCode };
```

在 `interface BrandAgent` 內追加一行：

```ts
  answerRbaItem(item: string): RbaItemAnswer;
```

在 `createBrandAgent` 回傳的物件內（`answer(query)` 之前）加入：

```ts
    answerRbaItem(item) {
      const classification = classifyRbaItem(item);
      if (classification === 'REQUIRES_ON_SITE') {
        return { ok: false, reason: 'REQUIRES_ONSITE_AUDIT' };
      }
      if (classification === 'UNKNOWN') {
        return { ok: false, reason: 'CLAIM_NOT_DISCLOSED' };
      }

      return { ok: true, item, answerable: true };
    },
```

- [ ] **Step 4: 跑測試確認轉綠**

執行：`npx vitest run packages/agents/test/rbaItemQuery.test.ts`
預期：3 passed。

- [ ] **Step 5: 在 demo 暴露一組代表性項目**

`packages/web/src/demo/world.ts`，在 `split()` 的 `return { bank, brand };` 之前，於 `createBrandAgent` 所在的 brand 區塊之外新增一個獨立方法。在 world 回傳物件內（`split` 之後）加入：

```ts
    /** 題06 Q3 shown as a list rather than buried in a test. */
    rbaCoverage() {
      const probe = createBrandAgent([]);
      const items = [
        'workingHoursWithinLimit',
        'recruitmentFeeWithinLegalCap',
        'passportHeldByWorker',
        'dormitoryLivingConditions',
        'fireSafetyConditions',
        'grievanceMechanismEffectiveness',
      ] as const;

      return items.map((item) => {
        const answer = probe.answerRbaItem(item);
        return { item, verdict: answer.ok ? 'CREDENTIAL_ANSWERABLE' : answer.reason };
      });
    },
```

並在 `packages/web/src/demo/world.ts:231` 的 `export interface DemoWorld` 內加入：

```ts
  rbaCoverage(): readonly { readonly item: string; readonly verdict: string }[];
```

- [ ] **Step 6: 在稽核台加一個面板**

`packages/web/src/views/ConsoleView.tsx`，在品牌側區塊末端加入：

```tsx
<div style={{ marginTop: '1rem' }}>
  <h4 style={{ margin: '0 0 0.4rem' }}>RBA 項目：憑證能答的與不能答的</h4>
  <p style={{ margin: '0 0 0.5rem', opacity: 0.75, fontSize: '0.85rem' }}>
    系統明說自己不能取代什麼。未列在分類表上的項目回 CLAIM_NOT_DISCLOSED，而不是默默作答。
  </p>
  <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85rem' }}>
    {rbaItems.map((row) => (
      <li key={row.item}>
        <code>{row.item}</code> —{' '}
        {row.verdict === 'CREDENTIAL_ANSWERABLE' ? '憑證可答' : row.verdict}
      </li>
    ))}
  </ul>
</div>
```

`rbaItems` 由 `App.tsx` 呼叫 `world.rbaCoverage()` 後經 props 傳入：在 `Props` 介面加入 `readonly rbaItems: readonly { readonly item: string; readonly verdict: string }[];`，並在 `App.tsx` 呼叫 `<ConsoleView ... rbaItems={...} />` 的地方補上該 prop。呼叫點在 `packages/web/src/App.tsx:162` 的 `<ConsoleView`。

- [ ] **Step 7: 驗證並 Commit**

執行：`npm test`
預期：`Tests 249 passed (249)`（246 ＋ 本 Task 3 個）。

執行：`npm run typecheck`
預期：無輸出。

依 Task A1 Step 12 的清單，把三份文件的測試數改為實測值，測試檔數改為 `28 個測試檔`。

```bash
git add packages/agents/src/brandAgent.ts packages/agents/test/rbaItemQuery.test.ts packages/web/src README.md docs/governance-memo.md packages/web/public/slides.html
git commit -m "feat(agents): expose which RBA items a credential can and cannot settle"
```

---

### Task B3: 查驗收據與撤銷反向通知接上流程（題06 Q4／Q5）

`issueVerificationReceipt`／`verifyReceipt`／`createVerificationLog` 三者都有實作與測試，但沒有任何流程會產生收據。題06 Q4 問的是「被 NGO 質疑時能不能出示何時驗了哪些項目」，Q5 問「撤銷能不能通知所有曾經驗證過的人」——沒有接線就等於沒有答案，因為收據是**給外部看的東西**，內部資料結構出示不了。

**Files:**
- Create: `packages/agents/test/receiptFlow.test.ts`
- Modify: `packages/web/src/demo/world.ts`
- Modify: `packages/web/src/views/ConsoleView.tsx`

**Interfaces:**
- Consumes: `issueVerificationReceipt(verifierPrivateKey, receipt): Promise<string>`、`verifyReceipt(receipt, verifierPublicKey): Promise<VerificationReceipt | null>`、`createVerificationLog(): VerificationLog`（`record`／`verifiersOf`／`notifyRevocation`）、`credentialHash`、`generateKeyPair`
- Produces: world 新增 `receipts(): readonly { verifierDid: string; verifiedItems: readonly string[]; result: 'PASS' | 'FAIL'; verifiedAt: string; independentlyVerified: boolean }[]` 與 `revocationNotices(): readonly { verifierDid: string; subjectCredentialHash: string }[]`

- [ ] **Step 1: 寫下會失敗的測試**

建立 `packages/agents/test/receiptFlow.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { generateKeyPair } from '@eas/shared';
import { createVerificationLog, issueVerificationReceipt, verifyReceipt } from '@eas/agents';

const BRAND_DID = 'did:web:brand.example';
const CREDENTIAL_HASH = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';

describe('a verification leaves a receipt that a challenger can check alone', () => {
  test('the receipt verifies under the verifier key and carries no raw values', async () => {
    const verifier = await generateKeyPair();
    const jwt = await issueVerificationReceipt(verifier.privateKey, {
      verifierDid: BRAND_DID,
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['workingHoursWithinLimit'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:00:00.000Z',
    });

    const checked = await verifyReceipt(jwt, verifier.publicKey);

    expect(checked?.verifierDid).toBe(BRAND_DID);
    expect(checked?.verifiedItems).toEqual(['workingHoursWithinLimit']);
    // The item name travels; the hours behind it never do.
    expect(jwt).not.toContain('186');
  });

  test('a receipt signed by someone else does not verify', async () => {
    const verifier = await generateKeyPair();
    const impostor = await generateKeyPair();
    const jwt = await issueVerificationReceipt(impostor.privateKey, {
      verifierDid: BRAND_DID,
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['workingHoursWithinLimit'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:00:00.000Z',
    });

    expect(await verifyReceipt(jwt, verifier.publicKey)).toBeNull();
  });

  test('revoking a credential names every verifier that ever checked it', () => {
    const log = createVerificationLog();
    log.record({
      verifierDid: BRAND_DID,
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['workingHoursWithinLimit'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:00:00.000Z',
    });
    log.record({
      verifierDid: 'did:web:bank.example',
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['feeWithinLegalCap'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:01:00.000Z',
    });

    const notices = log.notifyRevocation(CREDENTIAL_HASH);

    expect(notices.map((n) => n.verifierDid).sort()).toEqual([
      'did:web:bank.example',
      BRAND_DID,
    ]);
    // The notice carries a hash, never a worker.
    expect(JSON.stringify(notices)).not.toContain('zWorker');
  });
});
```

- [ ] **Step 2: 跑測試確認狀態**

執行：`npx vitest run packages/agents/test/receiptFlow.test.ts`

預期：3 passed。這三個 test 驗的是既有函式的既有行為，**本來就會過**——它們在這裡的作用是把 Q4／Q5 的保證釘住，避免後續接線改壞。若有任何一個 FAIL，停下來，那代表既有實作與 README 的宣稱不符，先查清楚再繼續。

- [ ] **Step 3: 在 demo 產生收據並記入日誌**

`packages/web/src/demo/world.ts`：

在 import 區塊追加 `createVerificationLog,`、`issueVerificationReceipt,`、`verifyReceipt,`（來自 `@eas/agents`）與 `credentialHash,`（來自 `@eas/shared`，若尚未匯入）。

在 `const applications = createApplicationMonitor();` 附近加入：

```ts
  // 題06 Q4/Q5: a receipt is the only form of proof a challenger can check
  // without being given access to anything. The log is the reverse index that
  // lets a revocation reach everyone who ever verified.
  const verificationLog = createVerificationLog();
  const brandVerifierKeys = await generateKeyPair();
  const issuedReceipts: { jwt: string; verifiedAt: string }[] = [];
  /** Hash of the most recently verified credential — the revocation index key. */
  let lastVerifiedHash: string | null = null;
```

在 `split()` 的 brand 區塊內，`buildCohortEvidence` 之後、`return` 之前加入：

```ts
        const hoursHash = hours === undefined ? null : credentialHash(await presentationFor(hours));
        if (hoursHash !== null) {
          const record = {
            verifierDid: 'did:web:brand.example',
            subjectCredentialHash: hoursHash,
            verifiedItems: ['workingHoursWithinLimit'] as const,
            result: (rejected.length === 0 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
            verifiedAt: new Date().toISOString(),
          };
          verificationLog.record(record);
          lastVerifiedHash = hoursHash;
          issuedReceipts.push({
            jwt: await issueVerificationReceipt(brandVerifierKeys.privateKey, record),
            verifiedAt: record.verifiedAt,
          });
        }
```

在 world 回傳物件內加入兩個方法：

```ts
    async receipts() {
      return Promise.all(
        issuedReceipts.map(async (entry) => {
          const checked = await verifyReceipt(entry.jwt, brandVerifierKeys.publicKey);
          return {
            verifierDid: checked?.verifierDid ?? '',
            verifiedItems: checked?.verifiedItems ?? [],
            result: checked?.result ?? 'FAIL',
            verifiedAt: entry.verifiedAt,
            // Re-verified here rather than asserted, so the panel shows a
            // checked fact and not a claim.
            independentlyVerified: checked !== null,
          };
        }),
      );
    },

    revocationNotices() {
      return lastVerifiedHash === null ? [] : verificationLog.notifyRevocation(lastVerifiedHash);
    },
```

`lastVerifiedHash` 是 Step 3 前段宣告的那個變數（見上），保存最近一次被查驗的憑證雜湊——撤銷反向通知是以**憑證雜湊**為索引，不是以收據數量。

並在 world 的介面型別加入：

```ts
  receipts(): Promise<readonly {
    readonly verifierDid: string;
    readonly verifiedItems: readonly string[];
    readonly result: 'PASS' | 'FAIL';
    readonly verifiedAt: string;
    readonly independentlyVerified: boolean;
  }[]>;
  revocationNotices(): readonly { readonly verifierDid: string; readonly subjectCredentialHash: string }[];
```

- [ ] **Step 4: 在稽核台顯示收據與撤銷通知名單**

`packages/web/src/views/ConsoleView.tsx`，在稽核軌跡面板之後加入：

```tsx
<div style={{ marginTop: '1rem' }}>
  <h4 style={{ margin: '0 0 0.4rem' }}>查驗收據（被質疑時可出示）</h4>
  {receipts.length === 0 ? (
    <p style={{ margin: 0, opacity: 0.7, fontSize: '0.85rem' }}>尚未產生——先執行一次 SplitDemo。</p>
  ) : (
    <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85rem' }}>
      {receipts.map((r) => (
        <li key={r.verifiedAt}>
          {r.verifiedAt} · {r.verifierDid} 驗了 <code>{r.verifiedItems.join('、')}</code> ·{' '}
          {r.result}
          {r.independentlyVerified ? ' · 簽章可獨立驗證 ✅' : ' · 簽章驗證失敗 ❌'}
        </li>
      ))}
    </ul>
  )}
  <p style={{ margin: '0.4rem 0 0', opacity: 0.75, fontSize: '0.8rem' }}>
    收據只含項目名稱與憑證雜湊，不含任何原始數值；持有查驗方公鑰的人都能獨立驗簽。
  </p>
</div>

<div style={{ marginTop: '1rem' }}>
  <h4 style={{ margin: '0 0 0.4rem' }}>撤銷反向通知名單</h4>
  {revocationNotices.length === 0 ? (
    <p style={{ margin: 0, opacity: 0.7, fontSize: '0.85rem' }}>尚無曾驗證者。</p>
  ) : (
    <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85rem' }}>
      {revocationNotices.map((n) => (
        <li key={n.verifierDid}>{n.verifierDid}</li>
      ))}
    </ul>
  )}
  <p style={{ margin: '0.4rem 0 0', opacity: 0.75, fontSize: '0.8rem' }}>
    這份憑證一旦被撤銷，上列每一個查驗方都會收到通知。名單由憑證雜湊反向索引產生，不含勞工識別碼。
  </p>
</div>
```

同樣把 `receipts` 與 `revocationNotices` 加進 `Props`，並在 `App.tsx` 的 `<ConsoleView />` 呼叫點傳入（`receipts` 需 `await`，存在 state 裡）。

- [ ] **Step 5: 驗證**

執行：`npm test`
預期：`Tests 252 passed (252)`（249 ＋ 本 Task 3 個）。

執行：`npm run typecheck`
預期：無輸出。

執行 build 與 preview，開啟稽核台跑一次 SplitDemo。
預期：收據面板出現一列、標示「簽章可獨立驗證 ✅」；撤銷通知名單出現 `did:web:brand.example`。

- [ ] **Step 6: 同步文件數字並 Commit**

依 Task A1 Step 12 的清單把測試數改為實測值，測試檔數改為 `29 個測試檔`。

```bash
git add packages/agents/test/receiptFlow.test.ts packages/web/src README.md docs/governance-memo.md packages/web/public/slides.html
git commit -m "feat(demo): mint a checkable receipt and name everyone a revocation must reach"
```

---

# Phase C — 讓文件指向畫面而不是測試

### Task C1: 命題對照表的證據升級

Phase B 之前，README 命題對照表裡題06 Q3／Q4／Q5 與題05 跨機構申辦四列的「可執行證據」欄位指的是**測試檔**——那是誠實的，但評審在 Demo Day 問「示範一下」時，指測試檔的說服力低於指畫面。Phase B 完成後這四列可以升級。

**Files:**
- Modify: `README.md`（Track 05 表格第 3 列、Track 06 表格第 3／4／5 列）

**Interfaces:**
- Consumes: Task B1／B2／B3 完成後的 demo 面板
- Produces: 無程式介面

- [ ] **Step 1: 升級四列的證據欄位**

`README.md` Track 05 表格，把「**被冒名利用**：同一身分短期在多機構申辦」那一列的證據欄位由：

```
| [`packages/agents/test/applicationMonitor.test.ts`](packages/agents/test/applicationMonitor.test.ts) |
```

改為：

```
| 稽核台銀行側「風險旗標」面板（線上 demo 可按）；[`packages/agents/test/applicationMonitor.test.ts`](packages/agents/test/applicationMonitor.test.ts) |
```

Track 06 表格，把「哪些項目可憑證化、哪些須實地稽核」那一列的證據欄位由：

```
| [`packages/agents/test/rbaItems.test.ts`](packages/agents/test/rbaItems.test.ts) |
```

改為：

```
| 稽核台「RBA 項目：憑證能答的與不能答的」面板；[`packages/agents/test/rbaItemQuery.test.ts`](packages/agents/test/rbaItemQuery.test.ts) |
```

把「被 NGO 質疑時的盡職調查證明」那一列的證據欄位由：

```
| [`packages/agents/test/receipt.test.ts`](packages/agents/test/receipt.test.ts) |
```

改為：

```
| 稽核台「查驗收據」面板（含獨立驗簽結果）；[`packages/agents/test/receiptFlow.test.ts`](packages/agents/test/receiptFlow.test.ts) |
```

把「撤銷要能通知所有曾經驗證過的人」那一列的證據欄位由：

```
| [`packages/agents/test/receipt.test.ts`](packages/agents/test/receipt.test.ts) |
```

改為：

```
| 稽核台「撤銷反向通知名單」面板；[`packages/agents/test/receiptFlow.test.ts`](packages/agents/test/receiptFlow.test.ts) |
```

- [ ] **Step 2: 在 Track 05 表格補上 L1 的新保證**

在 Track 05 表格的「**機構身分可信**」那一列之後新增一列：

```
| **「能被信任」**：連簽發者的公鑰都不能靠設定檔 | 簽發者公鑰只能從已驗證的法人 vLEI 鏈取得，裸金鑰在 L1 直接回 `ISSUER_VLEI_MISSING`——與 L0 對稱，皆為結構保證而非慣例 | [`packages/agents/test/issuerKeyProvenance.test.ts`](packages/agents/test/issuerKeyProvenance.test.ts) |
```

- [ ] **Step 3: 驗證並 Commit**

執行：`npm test`
預期：全綠——特別是 `every repository path the README points at resolves to a real file` 必須通過。若變紅，測試會列出打錯的路徑。

```bash
git add README.md
git commit -m "docs: point the mapping table at the demo, not only at the tests"
```

---

## 完成後的狀態

| 缺口 | 狀態 |
|---|---|
| L1 簽發者金鑰可繞過 vLEI | ✅ 執行期強制，裸金鑰回 `ISSUER_VLEI_MISSING`，與 L0 對稱 |
| 9 個測試用無鏈 `createIssuer` 發證 | ✅ 全面遷移至 `setupIssuerWorld()`，測試也走真實鏈 |
| 跨機構申辦監測未接線 | ✅ 銀行 Agent 收到風險旗標，稽核台可見 |
| RBA 項目分類未接線 | ✅ `brandAgent.answerRbaItem` ＋ 稽核台面板 |
| 查驗收據未接線 | ✅ SplitDemo 產生收據，畫面顯示獨立驗簽結果 |
| 撤銷反向通知未接線 | ✅ 稽核台顯示曾驗證者名單 |
| 對照表證據只指測試檔 | ✅ 四列升級為「畫面＋測試」 |
| ZK 真實電路 | ⚠️ 維持誠實降級（本機無 circom／Rust 工具鏈） |
| 正式命題對照 | ⚠️ 待 8/15、8/22 工作坊 |
