# vLEI 評審展示包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 給評審一份可執行的 vLEI 信任鏈證據（一支 `npm run demo:vlei` 腳本跑完簽發→驗證→竄改攔截→撤銷級聯）加一份技術防禦 Q&A 文件。

**Architecture:** 展示邏輯做成純函式 `runVleiDemo(): DemoReport`（可測試、不印東西），CLI 入口 `run.ts` 負責 poc 風格輸出與 exit code。防禦文件 `docs/vlei-defense.md` 逐條回答評審可能挑戰的點（自算 schema SAID、無 witness、舊金鑰偽簽、擴充欄位等），每一條都指向可執行的測試或 demo 步驟作為證據。

**Tech Stack:** TypeScript（既有 `@eas/vlei` API，零新運行時依賴）、`tsx`（新 devDependency，負責直接執行 TS）、vitest。

## Global Constraints

- Node `>=22`；新增依賴僅限 devDependency `tsx@^4.19.0`。
- `poc/` 兩支既有腳本一行不改；新展示腳本放 `packages/vlei/demo/`，不放 poc/。
- 原則三：demo 內全部合成資料——DID 用 `did:web:*.example`／`did:key:z*`，LEI 一律 `syntheticLei()` 產生。
- CLI 輸出風格對齊 poc：`console.log('標籤:', 值)` 加 `← 應為 X` 註記；文件繁中、程式碼與註解英文。
- 每 task 結束 `npx vitest run` 全綠 + `npm run typecheck` 無錯誤才 commit。
- 防禦文件的每個回答不得只有主張——必須指向 repo 內可執行的測試檔或 demo 步驟。

## File Structure

```
packages/vlei/demo/vleiCascade.ts   # runVleiDemo(): DemoReport — 純函式展示邏輯
packages/vlei/demo/run.ts           # CLI 入口：印報告、設 exit code
packages/vlei/test/demo.test.ts     # 驗證 report 全數通過與關鍵階段存在
package.json                        # 修改：devDependencies.tsx + scripts["demo:vlei"]
docs/vlei-defense.md                # 新增：評審 Q&A 防禦文件
README.md                           # 修改：執行 Demo 段 + 文件表
```

---

### Task 1: 可執行的 vLEI 信任鏈展示（runVleiDemo + CLI）

**Files:**
- Create: `packages/vlei/demo/vleiCascade.ts`
- Create: `packages/vlei/demo/run.ts`
- Modify: `package.json`（root：devDependency `tsx` + script `demo:vlei`）
- Test: `packages/vlei/test/demo.test.ts`

**Interfaces:**
- Consumes: `@eas/vlei` 既有 API——`bootstrapEcosystem()`、`Ecosystem.createLegalEntity/revokeQviCredential`、`LegalEntityHandle.grantEcr/revokeEcr/presentation`、`verifyEcrChain(p, trust, role?)`、`verifyLeChain(p, trust)`、`isValidLei`、型別 `SignedAcdc`、`VleiPresentation`。
- Produces: `interface DemoStep { label: string; expected: string; actual: string; pass: boolean }`、`interface DemoReport { steps: readonly DemoStep[]; allPass: boolean }`、`runVleiDemo(): DemoReport`。

- [ ] **Step 1: 寫 failing test**

`packages/vlei/test/demo.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { runVleiDemo } from '../demo/vleiCascade.js';

describe('judge-facing vLEI demo', () => {
  test('every step passes', () => {
    const report = runVleiDemo();

    for (const step of report.steps) {
      expect(step.pass, `${step.label}: got ${step.actual}, want ${step.expected}`).toBe(true);
    }
    expect(report.allPass).toBe(true);
  });

  test('the demo covers issuance, tampering, revocation and the QVI cascade', () => {
    const labels = runVleiDemo()
      .steps.map((step) => step.label)
      .join('|');

    expect(runVleiDemo().steps.length).toBeGreaterThanOrEqual(10);
    expect(labels).toContain('LEI');
    expect(labels).toContain('竄改');
    expect(labels).toContain('ECR 撤銷');
    expect(labels).toContain('QVI 撤銷');
    expect(labels).toContain('外來信任根');
  });
});
```

- [ ] **Step 2: 跑測試，確認 fail**

Run: `npx vitest run packages/vlei/test/demo.test.ts`
Expected: FAIL（vleiCascade.ts 不存在）

- [ ] **Step 3: 實作 `packages/vlei/demo/vleiCascade.ts`**

```ts
/**
 * Judge-facing runnable evidence for the vLEI trust layer.
 *
 * Pure function: builds a synthetic ecosystem, walks every claim the project
 * makes about it — chain verification, tamper detection, role enforcement,
 * single revocation, QVI cascade, foreign-root rejection — and returns a
 * structured report. The CLI wrapper prints; this file only proves.
 */

import {
  bootstrapEcosystem,
  isValidLei,
  verifyEcrChain,
  verifyLeChain,
  type SignedAcdc,
  type VleiPresentation,
} from '../src/index.js';

export interface DemoStep {
  readonly label: string;
  readonly expected: string;
  readonly actual: string;
  readonly pass: boolean;
}

export interface DemoReport {
  readonly steps: readonly DemoStep[];
  readonly allPass: boolean;
}

const JWK = { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' };

function step(label: string, expected: string, actual: string): DemoStep {
  return { label, expected, actual, pass: expected === actual };
}

function outcome(verdict: { ok: boolean } & { failure?: string }): string {
  return verdict.ok ? 'ok' : (verdict.failure ?? 'unknown');
}

export function runVleiDemo(): DemoReport {
  const steps: DemoStep[] = [];

  // 1 — GLEIF root of trust and a qualified QVI come up together.
  const eco = bootstrapEcosystem();
  steps.push(step('GLEIF 信任根為自我定址 AID（SAID）', 'E', eco.gleifAid.slice(0, 1)));

  // 2 — Two legal entities receive LE vLEI credentials from the QVI.
  const factory = eco.createLegalEntity({
    legalName: '工廠打卡系統',
    didWeb: 'did:web:factory.example',
    leiTag: 'FACTORYEXAMPLE',
    signingJwk: JWK,
  });
  const bank = eco.createLegalEntity({
    legalName: '國泰世華銀行',
    didWeb: 'did:web:bank.example',
    leiTag: 'BANKEXAMPLE',
    signingJwk: JWK,
  });
  steps.push(
    step(
      '法人 LEI 檢查碼合法（ISO 17442 mod 97-10）',
      'true',
      String(isValidLei(factory.lei) && isValidLei(bank.lei)),
    ),
  );

  // 3 — Chain verification walks every hop back to the GLEIF root.
  const agentChain = bank.grantEcr('did:key:zBankAgent');
  steps.push(step('LE 鏈驗證通過（工廠）', 'ok', outcome(verifyLeChain(factory.presentation(), eco.trust))));
  steps.push(step('ECR 鏈驗證通過（銀行 Agent）', 'ok', outcome(verifyEcrChain(agentChain, eco.trust))));

  // 4 — Tampering with one attribute breaks the SAID and is caught.
  const focus = agentChain.credentials[agentChain.focus] as SignedAcdc;
  const forged: VleiPresentation = {
    focus: agentChain.focus,
    credentials: {
      ...agentChain.credentials,
      [agentChain.focus]: {
        ...focus,
        acdc: { ...focus.acdc, a: { ...focus.acdc.a, agentDid: 'did:key:zEvilAgent' } },
      },
    },
  };
  steps.push(step('竄改 ECR 內容被攔截', 'SAID_MISMATCH', outcome(verifyEcrChain(forged, eco.trust))));

  // 5 — A role the verifier did not ask for is refused.
  const wrongRole = bank.grantEcr('did:key:zCoffeeAgent', 'coffee-runner');
  steps.push(step('非查驗角色被攔截', 'ROLE_MISMATCH', outcome(verifyEcrChain(wrongRole, eco.trust))));

  // 6 — Revoking one ECR kills that agent only; the legal entity survives.
  const doomed = bank.grantEcr('did:key:zTempAgent');
  bank.revokeEcr('did:key:zTempAgent');
  steps.push(step('單一 ECR 撤銷即失效', 'REGISTRY_REVOKED', outcome(verifyEcrChain(doomed, eco.trust))));
  steps.push(
    step('ECR 撤銷不影響法人本身', 'true', String(verifyLeChain(bank.presentation(), eco.trust).ok)),
  );

  // 7 — GLEIF revokes the QVI: everything downstream collapses at once.
  eco.revokeQviCredential();
  steps.push(
    step('QVI 撤銷 → 法人鏈級聯失效', 'REGISTRY_REVOKED', outcome(verifyLeChain(factory.presentation(), eco.trust))),
  );
  steps.push(
    step('QVI 撤銷 → Agent 鏈級聯失效', 'REGISTRY_REVOKED', outcome(verifyEcrChain(agentChain, eco.trust))),
  );

  // 8 — A chain anchored in someone else's root is worthless here.
  const foreign = bootstrapEcosystem();
  const foreignBank = foreign.createLegalEntity({
    legalName: '外來生態系銀行',
    didWeb: 'did:web:bank.example',
    leiTag: 'FOREIGNEXAMPLE',
    signingJwk: JWK,
  });
  steps.push(
    step(
      '外來信任根被拒（非我方 GLEIF）',
      'false',
      String(verifyEcrChain(foreignBank.grantEcr('did:key:zBankAgent'), eco.trust).ok),
    ),
  );

  return { steps, allPass: steps.every((entry) => entry.pass) };
}
```

- [ ] **Step 4: 實作 `packages/vlei/demo/run.ts`**

```ts
/**
 * CLI entry: poc-style output for the vLEI demo. Exit code 0 only when every
 * step of the report passes, so CI or a judge can rely on it mechanically.
 */

import { runVleiDemo } from './vleiCascade.js';

const report = runVleiDemo();

console.log('vLEI 信任鏈展示 — GLEIF → QVI → Legal Entity → ECR\n');

for (const step of report.steps) {
  const mark = step.pass ? '✓' : '✗';
  const note = step.pass ? '' : ` ← 應為 ${step.expected}`;
  console.log(`${mark} ${step.label}:`, step.actual + note);
}

console.log(
  report.allPass
    ? '\n全部通過：信任鏈可驗證、可撤銷、上游撤銷即全鏈失效。'
    : '\n有步驟失敗，見上方標記。',
);

process.exitCode = report.allPass ? 0 : 1;
```

- [ ] **Step 5: root `package.json` 加 devDependency 與 script**

devDependencies 加 `"tsx": "^4.19.0"`；scripts 加：

```json
    "demo:vlei": "tsx packages/vlei/demo/run.ts",
```

跑 `npm install`。

- [ ] **Step 6: 跑測試與實跑 CLI，確認 pass**

Run: `npx vitest run packages/vlei/test/demo.test.ts`
Expected: PASS（2 tests）

Run: `npm run demo:vlei`
Expected: 11 行 `✓`、結尾「全部通過」、exit code 0

- [ ] **Step 7: typecheck + commit**

```bash
npm run typecheck
git add packages/vlei package.json package-lock.json
git commit -m "feat(vlei): judge-facing runnable trust-chain demo (npm run demo:vlei)"
```

---

### Task 2: 評審防禦 Q&A 文件

**Files:**
- Create: `docs/vlei-defense.md`

**Interfaces:**
- Consumes: Task 1 的 `npm run demo:vlei` 與既有測試檔路徑（作為每個回答的證據指引）。

- [ ] **Step 1: 寫 `docs/vlei-defense.md`**（全文如下，繁體中文）

````markdown
# vLEI 技術防禦 Q&A

評審可能挑戰的每一點，以及我們的回答。每個回答都附上 repo 內**可執行的證據**——
不要求評審相信任何一句話，請直接跑。

一鍵總覽：`npm run demo:vlei`（簽發 → 驗證 → 竄改攔截 → 角色攔截 → 單點撤銷 →
QVI 撤銷級聯 → 外來信任根拒絕，exit code 0 即全數成立）。

---

### Q1. 為什麼不直接用 KERIA／signify-ts 這些官方 KERI 實作？

黑客松交付物是**全靜態瀏覽器 demo**（私鑰不離開裝置是核心論點），KERIA 需要
常駐 agent 服務與 witness 網路，會把「勞工裝置自主」變成「依賴我們架的伺服器」。
我們選擇在 repo 內實作 ACDC/KERI 的資料層子集，資料格式忠於規格（CESR matter
codes、KERI version string、SAID、pre-rotation KEL、TEL），驗證邏輯全部有測試。
簡化清單白紙黑字寫在 [`docs/vlei.md`](vlei.md) 的「明文簡化」一節。

**證據**：`packages/vlei/test/`（49 個測試）；`npm run demo:vlei`。

### Q2. 你們的 schema SAID 不是 GLEIF 官方登錄的，互通性呢？

正確，$id 是我們對自己的 schema profile 算出的 SAID（演算法與官方相同：
Blake3-256 over saidified serialization）。credentialType 沿用官方名稱四張全套
（QualifiedvLEIIssuervLEICredential 等），欄位對齊官方語意，擴充欄位逐一列表
並說明理由。接軌路徑：把 profile 換成官方 schema JSON、$id 換官方 SAID，驗證
碼一行不用改——schema 識別本來就是用 SAID 比對的。

**證據**：`packages/vlei/src/schemas.ts`；`packages/vlei/test/schemas.test.ts`。

### Q3. 金鑰輪替後，偷到舊金鑰的人可以偽簽舊序號的憑證嗎？

在本 PoC：可以，這是已知限制（docs/vlei.md 明文第 4 條）。簽章驗證 pin 在
`sigSeq`（簽發當下的 establishment event），輪替後舊憑證仍可驗——這是功能；
但偽簽舊 seq 的新憑證需要真 KERI 的事件錨定（TEL 錨進 KEL）才能徹底封死。
我們選擇誠實標註而不是假裝解決。值得指出的是：**pre-rotation 已實作**——
下一把金鑰的承諾寫在前一個事件裡，偷到現行金鑰也改寫不了輪替歷史，這是
KERI 相對傳統 PKI 的核心優勢，測試可證。

**證據**：`packages/vlei/test/kel.test.ts`（pre-rotation 承諾被破壞即整條 KEL 驗證失敗）。

### Q4. LE credential 塞 `credentialSigningJwk`、ECR 塞 `agentDid`，這不是偏離標準嗎？

是擴充，且是有意的：這兩個欄位是 KERI 世界（機構身分）與 SD-JWT 世界（勞工
憑證與 Agent 授權書）之間**唯一的橋**。機構簽 SD-JWT 的 ES256 公鑰只能從已驗證
的 LE 鏈取得，沒有第二個信任來源——這正是「改成 vLEI」的意義：刪掉手動維護的
公鑰名單。官方生態系日後若定義等價的 key-binding credential，替換點只有
`agents/vleiBridge.ts` 一個檔案。

**證據**：`packages/agents/test/vleiBridge.test.ts`；`packages/agents/src/delegationGate.ts`
（搜 `knownInstitutions`——已不存在）。

### Q5. 勞工的四張憑證為什麼不乾脆也改成 ACDC？

vLEI 是法人身分憑證體系，勞工不是法人；而勞工憑證的核心需求是**選擇性揭露**
（原則二：驗證方拿到的 payload 裡 `totalHours` 這個 key 密碼學上不存在）。
SD-JWT 的 `_sd` 機制對此是成熟標準；ACDC 的 graduated disclosure 能做但生態
工具鏈遠不成熟。所以架構是分層的：vLEI 管「機構是誰、Agent 憑什麼」，
SD-JWT 管「勞工的事實怎麼揭露」。

**證據**：`npm run demo:disclosure`（poc/，原則二的可執行定義）；
`packages/agents/test/vleiEndToEnd.test.ts`（兩層在同一條流程中協作）。

### Q6. 撤銷即時性？傳統 CRL/OCSP 有快取延遲問題。

TEL 是簽發方自己的事件日誌，驗證方每次驗鏈都重放（SAID + 簽章逐事件驗），
沒有快取層。demo 裡按下「GLEIF 撤銷 QVI」的下一次查詢就失效——不是輪詢到了
才失效。PoC 的 TEL 以 in-process store 共享；分散式部署時 TEL 的傳播延遲
取決於 witness/observer 架構，這在明文簡化清單裡。

**證據**：`npm run demo:vlei` 的 QVI 撤銷級聯步驟；前端稽核台按鈕實測。

### Q7. 撤銷級聯會不會誤傷？撤一個 Agent 是不是把整家機構弄死了？

方向性是對的也是設計的：撤銷只往**下游**傳播。demo 明確展示：撤單一 ECR 只
失效該 Agent、法人不受影響；撤 LE 只失效該機構與其 Agent、其他機構不受影響；
撤 QVI 才全體失效。三個粒度各自有測試。

**證據**：`packages/vlei/test/chain.test.ts`（revoking the ECR kills only that
agent authority / cascades 系列）；`npm run demo:vlei` 步驟 6–9。

### Q8. 驗證方憑什麼信你的 GLEIF root？這不還是一個信任錨？

是，且任何身分體系都有信任錨——差別在錨的形狀。傳統作法錨是「一份要人工維護
的公鑰設定檔」（每加一家機構改一次、洩漏一把換一次）。vLEI 的錨是**一個 AID**：
自我定址（識別碼即創世事件的雜湊）、可輪替（pre-rotation）、其下所有授權都是
可驗證的憑證而不是設定。錨從 N 個機構縮到 1 個 root，且 root 本身可密碼學驗證。

**證據**：demo 最後一步——同樣格式、同樣演算法、不同 root 的鏈被直接拒絕。

### Q9. 這套東西的效能？每次查詢都重放整條鏈與 KEL？

是，fail-closed 優先於效能：KelStore/TelStore 每次讀取都整條重驗，被竄改的
日誌解析不出任何金鑰。單條鏈重放在瀏覽器內毫秒級（Blake3 + Ed25519 都是
noble 純 JS，demo 網站實測含 UI 全流程 3 秒內）。真實部署的快取策略（驗過的
事件前綴記 memo）不影響安全模型，因為 SAID 鏈使任何竄改都會讓 memo 失配。

**證據**：`npx vitest run packages/vlei`（49 測試 1.4 秒，含數百次全鏈重放）。

### Q10. 為什麼評審要相信這不是「看起來像 vLEI 的自製品」？

三個檢查點：(1) 資料格式逐項對規格——CESR 前綴碼、KERI version string 兩段式
sizing、icp/rot/vcp/iss/rev 事件欄位、ACDC v/d/i/ri/s/a/e/r 區塊、官方 rules
條文逐字收錄；(2) 差異全部明文列出（docs/vlei.md 明文簡化五條 + 擴充欄位表），
沒有一項是藏著的；(3) 全部主張可執行——`npm run demo:vlei` 一條命令，
exit code 就是答案。

**證據**：`docs/vlei.md`；`packages/vlei/src/`（每檔案頭部註解標明對應規格與簡化）。
````

- [ ] **Step 2: 自我檢查**

逐條確認：每個 Q 的「證據」指到的檔案路徑真實存在（`ls` 驗證）；無「相信我們」式回答；繁中內文、代碼路徑準確。

- [ ] **Step 3: commit**

```bash
git add docs/vlei-defense.md
git commit -m "docs: judge-facing vLEI defense Q&A with runnable evidence per answer"
```

---

### Task 3: README 接線 + 全套回歸

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README「執行 Demo」段加 vLEI demo**

以 `grep -n "## 執行 Demo" README.md` 找到段落，在該段落內（既有 demo 指令之後）加：

```markdown
### vLEI 信任鏈展示

```bash
npm run demo:vlei
```

一條命令跑完：GLEIF→QVI→法人→Agent 簽發、全鏈驗證、竄改攔截（SAID）、
非查驗角色攔截、單一 ECR 撤銷、**QVI 撤銷全鏈級聯失效**、外來信任根拒絕。
exit code 0 即全數成立。評審常見提問的逐條回應見
[`docs/vlei-defense.md`](docs/vlei-defense.md)。
```

- [ ] **Step 2: README 文件表加一列**

在 `docs/vlei.md` 那一列之後：

```markdown
| [`docs/vlei-defense.md`](docs/vlei-defense.md) | vLEI 技術防禦 Q&A：每個回答附可執行證據 |
```

- [ ] **Step 3: 全套驗證 + commit**

```bash
npx vitest run
npm run typecheck
npm run demo:vlei
git add README.md
git commit -m "docs: wire the vLEI demo and defense doc into README"
```

---

## Self-Review

**1. Spec coverage** — 「可執行展示腳本」＝Task 1（11 個步驟涵蓋簽發/驗證/竄改/角色/單點撤銷/級聯/外來根）；「評審 Q&A 防禦」＝Task 2（10 問，每問附證據路徑）；README 接線＝Task 3。poc/ 不動、零新運行時依賴、合成資料——皆在 Global Constraints。

**2. Placeholder scan** — demo 兩檔、測試、防禦文件全文均為完整內容；無 TBD。

**3. Type consistency** — `runVleiDemo`/`DemoStep`/`DemoReport` 在 Task 1 測試與實作一致；`outcome()` 的 union 參數與 `ChainResult` 形狀相容（`{ ok } & { failure? }`）；Task 2/3 引用的命令與路徑對應 Task 1 產出。
