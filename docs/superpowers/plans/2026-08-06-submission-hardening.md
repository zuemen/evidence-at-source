# 交件品質補強 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「評審一驗就露餡」的文件不實陳述變成會失敗的測試，並補上主賽道（Track 05）命題對照與落地可行性論述——直接補齊決選配分中失分最重的兩塊。

**Architecture:** 三段。第一段把文件宣稱納入測試守門（延續 `principleOne.test.ts` 的既有慣例：主張不是寫在註解裡，而是一個會變紅的測試）。第二段是純內容補齊（README 命題對照表、新增落地路徑文件）。第三段把補齊後的論述反映到簡報與 GitHub 門面。段與段之間沒有程式相依，但順序有意義：先讓守門測試存在，後面每次改文件都自動被它檢查。

**Tech Stack:** TypeScript、Node 22、vitest 4、Node 內建 `node:fs/promises`（不引入新依賴）、GitHub CLI（`gh`）

## Global Constraints

- **語言慣例**：文件／README／Markdown 內文一律**繁體中文**；程式碼註解、變數名、函式名、commit message 一律**英文**。
- **CLAUDE.md 三原則不可違反**：(1) 禁用函式不得存在於程式碼中（`approveAccount`／`rejectAccount`／`freezeAccount`／`transferFunds`／`readTransactionHistory`）(2) 只回布林／匯總 (3) 全合成資料。
- **不得改動 `poc/` 下兩支腳本的邏輯**——它們是報名的關鍵證據。
- **不得自行擴充憑證欄位**；本計畫完全不動 `packages/*/src/`，只動 `packages/*/test/`、`docs/`、`README.md`、`packages/web/public/slides.html`。
- **vitest 只吃 `packages/*/test/**/*.test.ts`**（見 `vitest.config.ts:22`）——新測試檔必須放在某個 package 的 `test/` 下，放在 repo 根目錄不會被執行。
- **不新增 npm 依賴**。
- 每個 Task 結束前 `npm test` 與 `npm run typecheck` 都必須乾淨。
- Node 22 以上。

## 基準事實（本計畫撰寫時實測，2026-08-06）

| 事實 | 實測值 | 驗證方式 |
|---|---|---|
| vitest 實際執行測試數 | **240** | `npm test` → `Tests 240 passed (240)` |
| 靜態計數 `^\s*(test\|it)(\.\w+)?\(` | **240**（與 vitest 相同） | repo 內無 `test.each`／`it.each`／`describe.each`／`skip`／`todo`，靜態計數即精確值 |
| `packages/agents/test/*.test.ts` 檔數 | **26** | `ls packages/agents/test/*.test.ts \| wc -l` |
| README 無法解析的路徑引用 | **4 個**（見 Task 1） | 已用 probe 腳本實測 |
| main vs origin/main | 同步、工作區乾淨 | `git status -sb` |

## 不在本計畫範圍（但會影響得獎，需另外處理）

- **團隊人數 3–5 人**（主辦硬性規定，且得獎者須全體出席 Demo Day）——這不是程式問題，無法用計畫解決。Task 5 的團隊簡報頁需要真實名單作為前置輸入。
- **8/15 線上 Workshop／8/22 線下 Workshop 後才公布的正式完整命題**——屆時 Track 05／06 的命題對照表必須依正式題目重做，那是另一份計畫。本計畫的 Task 2 只對齊**目前已公開**的命題文字。
- **5 分鐘展示影片錄製**——講稿已存在（`docs/demo-video-script.md`），錄製屬於製作工作，不是實作。
- **ZK 真實電路接線**——需要 circom／Rust 工具鏈，本機無，維持現有誠實降級。

---

## File Structure

| 檔案 | 建立／修改 | 責任 |
|---|---|---|
| `packages/shared/test/docsConsistency.test.ts` | 建立 | 唯一責任：斷言對外文件對本 repo 的事實陳述為真（測試數、測試檔數、路徑引用）。放在 `shared` 是因為它檢查的是全 repo 層級的事實，不屬於任何單一功能套件。 |
| `README.md` | 修改 | 修正測試數宣稱、移除無法解析的引用、補齊 Track 05 命題對照、對齊移工人數口徑、文件表新增落地路徑 |
| `docs/governance-memo.md` | 修改 | 修正測試數與測試檔數宣稱 |
| `docs/adoption-path.md` | 建立 | 唯一責任：落地導入路徑與可行性論述（決選「可信技術導入 AI Agent 的可行性 25%」的正面答卷）。獨立成檔而非塞進 README，因為它的讀者是評審與潛在導入方，不是開發者。 |
| `packages/web/public/slides.html` | 修改 | 修正測試數與移工人數；新增 Track 05 對照頁、落地路徑頁、團隊頁 |

---

### Task 1: 文件事實守門測試（docs consistency gate）

把「README 說 114 個測試、governance-memo 說 237、簡報說 237、實際 240」這種矛盾變成 CI 會擋下來的錯誤。這個 repo 的核心主張是「不要相信我們說的任何一句話，去驗」——自己的數字對不上，傷害遠大於一般專案。

**Files:**
- Create: `packages/shared/test/docsConsistency.test.ts`
- Modify: `README.md:266`、`README.md:340-343`、`README.md:349`
- Modify: `docs/governance-memo.md:33`、`docs/governance-memo.md:52`
- Modify: `packages/web/public/slides.html:134`

**Interfaces:**
- Consumes: 無（不 import 任何 workspace 套件，只讀檔案系統）
- Produces: 無匯出。後續所有 Task 只要改動 README／governance-memo／slides.html 中的數字或路徑引用，都會被這個測試檢查。

**注意：這個測試檔本身含 3 個 test case，加入後全 repo 測試數由 240 變成 243。** 因此文件要寫的數字是 **243**，不是 240。Step 4 會實際跑一次確認。

- [ ] **Step 1: 寫下會失敗的測試**

建立 `packages/shared/test/docsConsistency.test.ts`：

```ts
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

  // `noUncheckedIndexedAccess` is on, so a capture group reads as
  // `string | undefined` even though the regex guarantees it at runtime.
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
```

- [ ] **Step 2: 跑測試，確認它以正確的理由失敗**

執行：`npx vitest run packages/shared/test/docsConsistency.test.ts`

預期：3 個 test 全部 FAIL，且訊息分別為
- `README.md claims 114, actual 243`、`README.md claims 237, actual 243`、`docs/governance-memo.md claims 237, actual 243`、`packages/web/public/slides.html claims 237, actual 243`
- `docs/governance-memo.md claims 22 files, actual 26`
- 未解析路徑陣列含 `docs/BUILD-SPEC-開發規格書.md`、`docs/ADR-001-系統架構與技術選型.md`、`docs/技術設計與論點防禦手冊.md`、`docs/痛點證據與可解決性評估.md`

若 `actual` 不是 243，代表期間有人增減測試——以測試印出的 actual 為準，後續步驟的數字一律改用該值。

- [ ] **Step 3: 修正 README 的測試數宣稱**

`README.md:266`，把：

```
npm test         # vitest，目前 114 個測試全綠
```

改成：

```
npm test         # vitest，目前 243 個測試全綠
```

`README.md:349`，把：

```
| 程式碼 | 本 repo（CI 每次 push 跑 237 tests + `demo:vlei` 閘門） |
```

改成：

```
| 程式碼 | 本 repo（CI 每次 push 跑 243 tests + `demo:vlei` 閘門） |
```

- [ ] **Step 4: 移除 README 中 4 個無法解析的文件引用**

`README.md:340-343`，刪除這四整列：

```
| `docs/BUILD-SPEC-開發規格書.md` | 模組拆解與測試情境（尚未入庫） |
| `docs/ADR-001-系統架構與技術選型.md` | 架構決策紀錄（尚未入庫） |
| `docs/技術設計與論點防禦手冊.md` | 對評審提問的技術防禦（尚未入庫） |
| `docs/痛點證據與可解決性評估.md` | 問題的證據基礎（尚未入庫） |
```

改為在表格末端新增這兩列（指向確實存在的檔案）：

```
| [`docs/incentive-chain.md`](docs/incentive-chain.md) | 誘因鏈：為什麼每一方都會簽 |
| [`docs/research/outline.yaml`](docs/research/outline.yaml) | 資料查證進度與來源追蹤 |
```

理由：那四份文件不存在，留著等於給評審四個死連結；`incentive-chain.md` 與 `outline.yaml` 確實存在卻沒被文件表列出，補上正好。

- [ ] **Step 5: 修正 governance-memo 的兩個數字**

`docs/governance-memo.md:33`，把：

```
**證據**：`runAuthorizedGate` 回呼設計；`packages/agents/test/` 22 個測試檔。
```

改成：

```
**證據**：`runAuthorizedGate` 回呼設計；`packages/agents/test/` 26 個測試檔。
```

`docs/governance-memo.md:52`，把：

```
**總驗證**：GitHub Actions 每次 push 跑 237 個測試＋`npm run demo:vlei`（14 步主張，
```

改成：

```
**總驗證**：GitHub Actions 每次 push 跑 243 個測試＋`npm run demo:vlei`（14 步主張，
```

- [ ] **Step 6: 修正簡報的測試數**

`packages/web/public/slides.html:134`，把：

```html
    <li><strong>237 個測試</strong>，GitHub Actions 每次 push 全跑。</li>
```

改成：

```html
    <li><strong>243 個測試</strong>，GitHub Actions 每次 push 全跑。</li>
```

- [ ] **Step 7: 跑全部測試確認轉綠**

執行：`npm test`
預期：`Test Files 52 passed (52)`、`Tests 243 passed (243)`

執行：`npm run typecheck`
預期：無輸出

- [ ] **Step 8: Commit**

```bash
git add packages/shared/test/docsConsistency.test.ts README.md docs/governance-memo.md packages/web/public/slides.html
git commit -m "test: gate the documents' factual claims about this repository"
```

---

### Task 2: 補齊 Track 05 主賽道命題對照

現況失衡：命題對照表有 Track 06（加分題）五列，Track 05（主賽道）只有一列。決選「產業應用場景契合度 35%」按主賽道評，評審看表的第一印象會是「這隊主力在 RBA，移工只是包裝」。系統裡該做的其實都做完了，只是沒寫進對照表。

**Files:**
- Modify: `README.md:16`（移工人數口徑）
- Modify: `README.md:184-196`（命題對照表）
- Modify: `packages/web/public/slides.html:59`（移工人數口徑）

**Interfaces:**
- Consumes: Task 1 建立的 `docsConsistency.test.ts`——本 Task 新增的所有路徑引用都必須真實存在，否則測試三會變紅
- Produces: 無程式介面

- [ ] **Step 1: 先確認本 Task 會引用的檔案都存在**

執行：

```bash
ls packages/agents/src/bankAgent.ts packages/agents/src/applicationMonitor.ts \
   packages/agents/test/revocationPaths.test.ts packages/agents/test/applicationMonitor.test.ts \
   packages/agents/test/issuerTierGate.test.ts packages/agents/test/differencing.test.ts \
   packages/shared/test/attestation.test.ts poc/dual-signature.mjs
```

預期：八個路徑全部列出，無 `No such file`。若某個路徑不存在，先用 `ls packages/agents/src/` 找出正確檔名再寫進表格——**絕不寫一個沒驗證過的路徑**（那會讓 Task 1 的守門測試變紅，正是它存在的目的）。

- [ ] **Step 2: 對齊移工人數口徑**

主辦命題文字用的是「逾 **87 萬**移工」，README:16 寫的是「約 **80 萬**人」。數字比主辦小會讓評審覺得沒讀題。

`README.md:16`，把：

```
台灣的產業與社福移工約 **80 萬人**（勞動部統計，2024 年逾 79 萬、近 81 萬）。以下兩個場景看起來毫不相干，但根因是同一個。
```

改成：

```
台灣的產業與社福移工**逾 87 萬人**（主辦方命題口徑；勞動部 2024 年統計為逾 79 萬、近 81 萬，本文採主辦口徑並註明統計年度差異）。以下兩個場景看起來毫不相干，但根因是同一個。
```

`packages/web/public/slides.html:59`，把：

```html
    <li><strong>80 萬移工</strong>：近三成曾受詐、估逾 17 億；離境後帳戶沒人知道，成為現成人頭帳戶。</li>
```

改成：

```html
    <li><strong>87 萬移工</strong>：近三成曾受詐、估逾 17 億；離境後帳戶沒人知道，成為現成人頭帳戶。</li>
```

- [ ] **Step 3: 重寫命題對照表**

`README.md:184-195`，把整個「## 命題對照（題目 05／06）」段落的標題與表格換成下列內容（保留段落之後的「**紅線註記**」那一段不動）：

```markdown
## 命題對照

### Track 05（主賽道）｜移工數位信任：普惠金融與防詐的憑證機制

> 主辦命題：「逾 87 萬移工面臨開戶障礙，也容易遭冒名利用；如何建立一套『能被信任、又不被冒用』的數位身分與憑證機制？」

| 命題要素 | 本專案的回答 | 可執行證據 |
|---|---|---|
| **開戶障礙**：證明分散在仲介、雇主、移民署，反覆補件 | 四項事實由勞工自持、可攜、一次出示；銀行 Agent 走完 L0→L1→L2 即得布林結論與建議 | [`packages/agents/src/bankAgent.ts`](packages/agents/src/bankAgent.ts)；線上 demo 錢包授權檢視卡＋稽核台 SplitDemo |
| **被冒名利用**：離境後帳戶仍可用，成為人頭帳戶 | 主體連動撤銷——離境即該勞工全部憑證同時失效，銀行端立刻 `CREDENTIAL_REVOKED`，其他勞工不受影響 | [`packages/agents/test/revocationPaths.test.ts`](packages/agents/test/revocationPaths.test.ts)；稽核台 RevokeDemo |
| **被冒名利用**：同一身分短期在多機構申辦 | 匿名化申辦計數器只回報「是否超閾」，不回報申辦去向；風險旗標只供人類覆核，不做決定 | [`packages/agents/test/applicationMonitor.test.ts`](packages/agents/test/applicationMonitor.test.ts) |
| **「能被信任」**：憑證來源本身可不可信 | 簽發者分級 T1 自我聲明／T2 第三方／T3 主管機關＋`minimumIssuerTier` L1 閘門（`ISSUER_TIER_BELOW_THRESHOLD`） | [`packages/agents/test/issuerTierGate.test.ts`](packages/agents/test/issuerTierGate.test.ts) |
| **「不被冒用」**：出示的人就是持有的人 | 雙簽配對＋私鑰在瀏覽器產生且從未離開裝置；雇主沒有勞工私鑰，偽造不出新的配對 | [`packages/shared/test/attestation.test.ts`](packages/shared/test/attestation.test.ts)、[`poc/dual-signature.mjs`](poc/dual-signature.mjs) |
| **防詐但不傷隱私**：查得到風險，查不到人 | L2 只放行布林／k-匿名匯總；個體查詢一律 `INDIVIDUAL_QUERY_REJECTED`；相減可回推的連續查詢回 `DIFFERENCING_ATTACK_DETECTED` | [`packages/agents/test/differencing.test.ts`](packages/agents/test/differencing.test.ts) |
| **機構身分可信**：Agent 代表誰不能靠自稱 | GLEIF vLEI 憑證鏈 Root→QVI→法人→ECR，L0 每次查詢重驗全鏈，上游撤銷下游即時失效 | `npm run demo:vlei`（14 步，exit code 0 即全數成立）；[`docs/vlei-defense.md`](docs/vlei-defense.md) |

### Track 06（加分題）｜RBA 供應鏈合規的可驗證憑證機制

> 主辦命題：「RBA 稽核仍高度依賴人工與紙本；如何讓供應鏈合規證明持續可驗證，同時不必揭露工廠的完整內部資料？」

| 命題要素 | 本專案的回答 | 可執行證據 |
|---|---|---|
| **持續可驗證**，不是一年一次紙本稽核 | 事件當下簽章封存＋每期 Merkle 承諾；稽核從「事後追查誰說謊」變成「當場驗簽章是否成立」 | [`packages/agents/test/scenarioT11.test.ts`](packages/agents/test/scenarioT11.test.ts) |
| **不揭露工廠完整內部資料** | 品牌 Agent 只拿得到合規率與母體人數，拿不到任何一位勞工的工時 | [`packages/agents/test/brandAgent.test.ts`](packages/agents/test/brandAgent.test.ts) |
| 哪些項目可憑證化、哪些須實地稽核 | `RBA_ITEM_CLASSIFICATION`＋`classifyRbaItem`；不可憑證化回 `REQUIRES_ONSITE_AUDIT`，未列項目回 `UNKNOWN` 而非默默作答 | [`packages/agents/test/rbaItems.test.ts`](packages/agents/test/rbaItems.test.ts) |
| 被 NGO 質疑時的盡職調查證明 | 可獨立驗簽的查驗收據——只含項目名稱與憑證雜湊，不含原始值 | [`packages/agents/test/receipt.test.ts`](packages/agents/test/receipt.test.ts) |
| 撤銷要能通知所有曾經驗證過的人 | 查驗日誌反向索引（憑證雜湊 → 驗證方），產生撤銷通知名單 | [`packages/agents/test/receipt.test.ts`](packages/agents/test/receipt.test.ts) |
| 憑證綁定產線，防 A 廠憑證挪用到 B 廠 | `facilityId` 欄位＋`expectedFacilityId` 閘門（`CREDENTIAL_FACILITY_MISMATCH`） | [`packages/agents/test/credentialLayer.test.ts`](packages/agents/test/credentialLayer.test.ts) |
| **防報復**（RBA 稽核最容易被忽略的一層） | 「哪幾位勞工申報超時」這個能力在架構上不存在，不是被擋掉 | [`packages/agents/test/policyGate.test.ts`](packages/agents/test/policyGate.test.ts) |

> **命題細節註記**：主辦方載明 Track 05／06 的完整命題（背景、核心可信問題、方向提示）於入選後工作坊公布（8/15 線上、8/22 線下）。上表對照的是**目前已公開的命題文字**；取得完整命題後本表將重做。
```

- [ ] **Step 4: 跑測試確認新增的引用全部可解析**

執行：`npm test`
預期：`Tests 243 passed (243)`——特別是 `every repository path the README points at resolves to a real file` 必須是綠的。若變紅，測試訊息會列出打錯的路徑，逐一修正。

- [ ] **Step 5: Commit**

```bash
git add README.md packages/web/public/slides.html
git commit -m "docs: map the primary track's problem statement to executable evidence"
```

---

### Task 3: 落地可行性文件（決選 25% 的正面答卷）

決選第二重的評分項是「可信技術導入 AI Agent 的**可行性** 25%」。repo 現在 100% 是技術證據，關於「誰先導入、掛在哪條既有流程上、誰付錢、多久」完全沒有文字。這是可以直接得分卻空著的一塊。

**Files:**
- Create: `docs/adoption-path.md`
- Modify: `README.md` 文件表（在 Task 1 Step 4 新增的兩列之後再加一列）

**Interfaces:**
- Consumes: Task 1 的守門測試（新檔案建立後，README 才能引用它）
- Produces: `docs/adoption-path.md`，供簡報 Task 4 的「落地路徑」頁取材

- [ ] **Step 1: 建立 `docs/adoption-path.md`**

內容如下：

```markdown
# 落地導入路徑與可行性

**這份文件回答的問題**：技術成立不等於落得了地。誰會先用、掛在哪條既有流程上、誰付錢、要不要改法規、多久看得到第一個真實使用者。

## 一、先做 B2B，不先做 B2C

移工不會因為「有一個好錢包」就去下載。**先讓付錢的一方有理由推動，勞工端才會有量。**

導入順序刻意反直覺——**先 Track 06（品牌 RBA 稽核），後 Track 05（銀行開戶）**：

| | 品牌 RBA 稽核 | 銀行開戶 |
|---|---|---|
| 付費方是否明確 | ✅ 品牌已在付稽核費 | ⚠️ 銀行視移工開戶為成本中心 |
| 合規壓力 | ✅ 歐盟 CSRD、德國供應鏈盡職調查法已在罰 | ⚠️ 主要是打詐政策壓力 |
| 導入單位 | 單一產線即可起跑（數十至數百人） | 需分行流程改造＋法遵審查 |
| 失敗成本 | 低——稽核多一份證據，不取代原流程 | 高——牽涉 KYC 責任歸屬 |

**結論**：第一個真實使用者是「一條產線的勞工」，不是「一位要開戶的移工」。品牌端跑順了，同一批勞工手上已經有反簽過的憑證，銀行端才有存量可用——這也是為什麼四張憑證從一開始就同時服務兩個場景。

## 二、掛在既有流程上，不要求改法規

本系統**不主張取代任何現行程序**，只補上現行程序缺的那一段：勞工自持的、簽發當下就固定的證據。

**銀行側的既有掛靠點**：金管會與行政院打詐專案已於 2024/08 起由金融聯合徵信中心介接移民署資料，供銀行查移工在台狀況。那條線解決的是「這個人還在不在境內」；本系統補的是「關於這個人的四項事實是誰簽的、有沒有被事後改過」。兩者互補而非競爭——**憑證作為現有 KYC 文件的補充證據，不是取代**，因此第一階段不需要任何法規變更。

**品牌側的既有掛靠點**：RBA 稽核清單本身不變，改變的只是清單上部分項目的證據來源——從「工廠提供的紙本」變成「勞工反簽的憑證」。`classifyRbaItem` 明確標示哪些項目仍必須實地稽核（回 `REQUIRES_ONSITE_AUDIT`），**不宣稱能取代實地稽核**，這是稽核機構願意接受的前提。

## 三、誰付錢

| 角色 | 付出 | 得到 |
|---|---|---|
| 品牌 | 導入費用（取代部分紙本稽核成本） | 持續可驗證的合規證據；被 NGO 質疑時可出示驗簽收據 |
| 工廠／雇主 | 打卡系統加簽章模組 | 免於事後被單方指控；證據是勞工共同簽的，不是自己說的 |
| 仲介 | 收費與契約當下簽章 | 同上；且合規仲介得以與違規者區隔 |
| 勞工 | 反簽一個動作 | 一份自持、可攜、可選擇性揭露的通行證；開戶不必反覆補件 |
| 銀行 | 介接查驗端點 | 開戶查驗時間下降；離境連動撤銷降低人頭帳戶風險 |

誘因結構的完整論述見 [`incentive-chain.md`](incentive-chain.md)——拱心石是**每一方之所以願意簽，是因為對方的簽章保護了自己**。

## 四、12 個月時程

| 階段 | 期間 | 範圍 | 完成標準 |
|---|---|---|---|
| P0 現況 | — | 全模組可跑、靜態站上線、CI 全綠 | 已達成 |
| P1 單一產線試點 | 1–3 月 | 一家工廠一條產線，僅 `WorkingHoursCredential` | 一個週期的合規率由憑證產生，與紙本核對一致 |
| P2 四張憑證全開 | 4–6 月 | 同一產線加入仲介費、證件保管、契約同意 | 證據完整性指數達 B 級以上；省略偵測抓得到刻意漏記 |
| P3 銀行端試點 | 7–9 月 | 一家銀行一個分行，接受 P2 產出的憑證作為補充證據 | 開戶查驗流程走完，補件次數下降可量測 |
| P4 跨機構 | 10–12 月 | 第二家品牌／第二家銀行接同一批勞工的憑證 | 憑證可攜性成立——換驗證方不必重新簽發 |

## 五、已知風險與對應

| 風險 | 對應機制 | 現況 |
|---|---|---|
| 勞工裝置遺失＝金鑰遺失 | KERI pre-rotation 已在機構層實作；勞工層需補金鑰輪替與重新反簽流程 | ⚠️ 機構層 ✅、勞工層待實作 |
| 簽發方不配合簽章 | 誘因鏈：不簽的一方無法主張自己的紀錄成立 | ✅ 論述完成，見 `incentive-chain.md` |
| ZK 對帳未接真實電路 | 綁定四項檢查已實作，證明數學置於注入的 `verifyProof` 之後，預設 stub 一律拒絕 | ⚠️ 誠實降級，見 [`zk-reconciliation.md`](zk-reconciliation.md) |
| 「法定上限」等數字未查證 | 憑證結構不依賴該數字；查證進度追蹤於 [`research/outline.yaml`](research/outline.yaml) | ⚠️ 對外主張前須完成 |
| 評審質疑「這需要全產業一起動」 | P1 只需要一家工廠一條產線；憑證可攜性讓後續加入者不必重簽 | ✅ 設計上就是漸進式 |

## 六、一句話

**不需要任何人改法規、不需要全產業同時上車、不需要移工先下載任何東西——第一步只是一條產線的打卡系統多簽一個章。**
```

- [ ] **Step 2: 在 README 文件表新增一列**

在 Task 1 Step 4 新增的兩列之後，加入：

```
| [`docs/adoption-path.md`](docs/adoption-path.md) | 落地導入路徑、誰付錢、12 個月時程與已知風險 |
```

- [ ] **Step 3: 跑測試**

執行：`npm test`
預期：`Tests 243 passed (243)`（新檔案存在，README 引用可解析）

執行：`npm run typecheck`
預期：無輸出

- [ ] **Step 4: Commit**

```bash
git add docs/adoption-path.md README.md
git commit -m "docs: adoption path, funding model and twelve-month rollout"
```

---

### Task 4: 簡報補上主賽道對照與落地路徑

決選「簡報與 Demo 呈現 25%」。現有 10 張全部在講技術，沒有一張回答「這東西怎麼落地」——那是另外 25% 的評分項。

**Files:**
- Modify: `packages/web/public/slides.html`（在既有 `<section>` 之間插入兩張）

**Interfaces:**
- Consumes: Task 2 的 Track 05 對照內容、Task 3 的 `docs/adoption-path.md`
- Produces: 簡報張數由 10 增為 12（頁碼由 `slides.length` 自動計算，翻頁 script 不需修改）

- [ ] **Step 1: 插入「Track 05 對照」頁**

在 `packages/web/public/slides.html` 中，「兩個場景，同一個根因」那個 `<section>`（結尾為 `</section>`，其後為 `<p class="kicker">解法</p>` 所在的 section）之後、「解法」section 之前，插入：

```html
<section>
  <p class="kicker">主賽道 · Track 05</p>
  <h2>「能被信任、又不被冒用」——逐項拆開</h2>
  <table>
    <tr><th>開戶障礙</th><td>四項事實勞工自持、可攜、<strong>一次出示</strong>，不必回頭跟三個單位要</td></tr>
    <tr><th>離境變人頭</th><td>主體連動撤銷：離境＝全部憑證同時失效，<strong>其他勞工不受影響</strong></td></tr>
    <tr><th>跨機構冒名</th><td>匿名申辦計數器只回「是否超閾」，<strong>不回申辦去向</strong>；旗標只供人審</td></tr>
    <tr><th>能被信任</th><td>簽發者分級 T1/T2/T3＋最低層級閘門——<strong>來源本身也要被驗</strong></td></tr>
    <tr><th>不被冒用</th><td>雙簽配對＋私鑰從未離開裝置——<strong>雇主偽造不出新的配對</strong></td></tr>
    <tr><th>防詐不傷隱私</th><td>查得到風險、<strong>查不到人</strong>：布林／k-匿名／差分攻擊偵測</td></tr>
  </table>
</section>
```

- [ ] **Step 2: 插入「落地路徑」頁**

在「可信度／不要相信我們說的任何一句話」那個 `<section>` 之前插入：

```html
<section>
  <p class="kicker">落地</p>
  <h2>不需要改法規、不需要全產業同時上車</h2>
  <ul>
    <li><strong>先 B2B 後 B2C</strong>：先做品牌 RBA（付費方明確、已在罰），同一批勞工手上就有憑證，銀行端才有存量。</li>
    <li><strong>掛在既有流程上</strong>：憑證是現行 KYC 的<strong>補充證據</strong>，不取代——第一階段零法規變更。</li>
    <li><strong>第一步只有一個動作</strong>：一條產線的打卡系統多簽一個章。</li>
  </ul>
  <p class="bar">P1 單一產線（1–3 月）→ P2 四張憑證全開（4–6 月）→ P3 銀行分行試點（7–9 月）→ P4 跨機構可攜（10–12 月）</p>
  <p>完整路徑、誰付錢、已知風險：<code>docs/adoption-path.md</code></p>
</section>
```

- [ ] **Step 3: 本機開啟確認翻頁與頁碼**

執行（`preview` script 已存在於 `packages/web/package.json`，不要自己組 `npx vite` 指令）：

```bash
npm run build --workspace @eas/web
npm run preview --workspace @eas/web -- --port 4173
```

`slides.html` 位於 `packages/web/public/`，build 後會被原樣複製到 `dist/slides.html`。

開啟 `http://localhost:4173/slides.html`，用 → 鍵翻到底。
預期：右下角頁碼顯示 `12 / 12`；新增兩頁的表格與清單不溢出畫面。看完按 Ctrl+C 結束 preview。

- [ ] **Step 4: 跑測試**

執行：`npm test`
預期：`Tests 243 passed (243)`——新增內容不得引入新的測試數字宣稱（新頁面沒有數字宣稱，若守門測試變紅代表誤植）。

- [ ] **Step 5: Commit**

```bash
git add packages/web/public/slides.html
git commit -m "docs(slides): primary-track mapping and adoption path"
```

---

### Task 5: 團隊頁（需要真實名單作為前置輸入）

初選配分「團隊能力 20%」，決選得獎條件是全體成員出席。目前 repo 與簡報**完全沒有團隊資訊**，等於在 20 分的項目上交白卷。

**前置輸入（本 Task 無法自行取得）**：最終成員名單（3–5 人，主辦硬性規定）、各自分工、與本題相關的背景一句話。**沒有這份名單就不要執行本 Task**——寫假名字比不寫更糟。

**Files:**
- Modify: `packages/web/public/slides.html`（在結尾頁之前插入一張）
- Modify: `README.md`（在「## 授權」之前新增「## 團隊」段落）

**Interfaces:**
- Consumes: Task 4 完成後的簡報結構
- Produces: 簡報張數由 12 增為 13

- [ ] **Step 1: 在簡報插入團隊頁**

在最後一個 `<section>`（`<h1>zuemen.github.io/...`）之前插入下列結構，把 `姓名`、`分工`、`一句話背景` 換成真實內容，成員數依實際 3–5 人增減 `<tr>`：

```html
<section>
  <p class="kicker">團隊</p>
  <h2>誰做的</h2>
  <table>
    <tr><th>姓名</th><td><strong>分工</strong>——一句話背景</td></tr>
    <tr><th>姓名</th><td><strong>分工</strong>——一句話背景</td></tr>
    <tr><th>姓名</th><td><strong>分工</strong>——一句話背景</td></tr>
  </table>
  <p class="bar">全部程式碼、文件與簡報皆於本 repo 公開，commit 歷史可追溯每一項主張的完成時點。</p>
</section>
```

- [ ] **Step 2: 在 README 新增團隊段落**

在 `## 授權` 之前插入（同樣以真實內容替換）：

```markdown
## 團隊

| 成員 | 分工 |
|---|---|
| 姓名 | 分工 |
| 姓名 | 分工 |
| 姓名 | 分工 |
```

- [ ] **Step 3: 確認頁碼**

執行：

```bash
npm run build --workspace @eas/web
npm run preview --workspace @eas/web -- --port 4173
```

開啟 `http://localhost:4173/slides.html`，翻到底。
預期：右下角顯示 `13 / 13`，且團隊頁不含任何佔位文字（`姓名`／`分工`／`一句話背景` 必須全部換成真實內容）。看完按 Ctrl+C 結束 preview。

- [ ] **Step 4: 跑測試並 Commit**

執行：`npm test`
預期：`Tests 243 passed (243)`

```bash
git add packages/web/public/slides.html README.md
git commit -m "docs: team roster in README and deck"
```

---

### Task 6: GitHub 門面

評審點進 repo 的第一眼：`description` 空白、無 topics、About 的 homepage 指向 Vercel 而 README 主推 GitHub Pages——兩個網址並存沒統一。

**Files:**
- 無檔案變更（GitHub repo metadata，透過 `gh` 設定）

**Interfaces:**
- Consumes: 無
- Produces: 無

- [ ] **Step 1: 確認目前狀態**

執行：

```bash
gh repo view zuemen/evidence-at-source --json description,homepageUrl,repositoryTopics
```

預期：`description` 為空字串、`homepageUrl` 為 `https://evidence-at-source-web.vercel.app`。

- [ ] **Step 2: 設定 description、homepage 與 topics**

執行：

```bash
gh repo edit zuemen/evidence-at-source \
  --description "勞工自持雙簽憑證錢包＋三層 Policy Gate——讓 AI Agent 只能問到答案，拿不到資料。2026 可信 AI 黑客松 Track 05 × 06。" \
  --homepage "https://zuemen.github.io/evidence-at-source/" \
  --add-topic verifiable-credentials \
  --add-topic sd-jwt \
  --add-topic self-sovereign-identity \
  --add-topic vlei \
  --add-topic keri \
  --add-topic ai-agent-governance \
  --add-topic policy-gate \
  --add-topic selective-disclosure \
  --add-topic migrant-workers \
  --add-topic typescript
```

homepage 改指 GitHub Pages 的理由：那是 CI 每次 main 全綠自動部署的版本，與 repo 內容保證同步；Vercel 鏡像沒有這個保證。

- [ ] **Step 3: 驗證**

執行：

```bash
gh repo view zuemen/evidence-at-source --json description,homepageUrl,repositoryTopics
```

預期：description 為上述字串、homepageUrl 為 `https://zuemen.github.io/evidence-at-source/`、topics 含 10 個項目。

- [ ] **Step 4: 推送前面所有 commit**

執行：

```bash
git push origin main
```

- [ ] **Step 5: 確認 CI 綠燈**

執行：

```bash
gh run list --repo zuemen/evidence-at-source --limit 1
```

預期：最新一筆 `completed success`。若失敗，用 `gh run view --log-failed` 讀出失敗原因再修——**不得為了讓 CI 過而放寬 Task 1 的守門測試**。

---

## 完成後的狀態

| 缺口 | 狀態 |
|---|---|
| 測試數三處矛盾（114／237／240） | ✅ 統一為 243，且由測試守門，日後再也不會漂 |
| governance-memo 測試檔數 22（實為 26） | ✅ 一併納入守門 |
| README 4 個死引用 | ✅ 移除，並由測試防止再度出現 |
| 移工人數與主辦口徑不符 | ✅ 對齊 87 萬並註明年度差異 |
| Track 05 主賽道只對到 1 項 | ✅ 擴為 7 項，主賽道份量超過加分題 |
| 落地可行性論述空白 | ✅ `docs/adoption-path.md`＋簡報一頁 |
| 簡報缺主賽道／落地／團隊頁 | ✅ 10 張 → 13 張 |
| GitHub 門面空白、雙網址 | ✅ description／topics／homepage 統一 |
| 團隊資訊 | ⚠️ Task 5 待真實名單 |
| 正式命題對照 | ⚠️ 待 8/15 工作坊，屆時另立計畫 |
| 展示影片 | ⚠️ 講稿已備，待錄製 |
