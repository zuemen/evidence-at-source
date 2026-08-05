# 黑客松繳交缺口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊可信 AI 黑客松 2026（8/30 截止）尚缺的必要交件——Governance Gap Memo（六信任點一頁說明）、Demo Day 簡報、統一稽核軌跡（Audit Log 弱點補強）、錄影講稿——並在 README 建立繳交清單。

**Architecture:** 交件全部住在 repo 內、隨 CI 自動上線：memo 與講稿是 docs/ 下的 Markdown；簡報是一個零依賴的單檔 HTML（放 `packages/web/public/`，隨既有 Pages 部署到 `/slides.html`）；稽核軌跡是 agents 的新模組（每次閘門決策記錄 layer/decision/reason/授權依據），接進 demo world 與稽核台。

**Tech Stack:** 既有 stack，零新依賴。簡報為手寫 HTML+CSS（沿用 ink/jade 設計語言，鍵盤翻頁）。

## Global Constraints

- 主辦方六信任點框架逐字對齊：Principal／Authorization／Tool·Action／Policy Gate／Audit Log／Expiry·Revocation。
- 合成資料原則三照舊；`poc/` 不動；零新 npm 依賴。
- 每 task 結束 `npx vitest run` 全綠 + `npm run typecheck` 乾淨才 commit；push 後 CI 綠。
- 文件繁中；memo 嚴格一頁規模（六點各 ≤3 句 + 證據指標）。
- 決選配分導向：簡報結構須先場景（35%）再技術可行性（25%），攻防與巧思（15%）殿後。

## File Structure

```
docs/governance-memo.md            # 新增：一頁治理／信任設計說明（必交件）
packages/agents/src/auditTrail.ts  # 新增：統一稽核軌跡
packages/agents/test/auditTrail.test.ts
packages/web/src/demo/world.ts     # 修改：閘門決策寫入軌跡 + auditLog() 暴露
packages/web/src/views/ConsoleView.tsx # 修改：稽核軌跡折疊面板
packages/web/public/slides.html    # 新增：Demo Day 簡報（隨 Pages 上線 /slides.html）
docs/demo-video-script.md          # 新增：5 分鐘錄影／簡報講稿（逐幕秒數）
README.md                          # 修改：繳交清單 section
```

---

### Task 1: Governance Gap Memo（必交件）

**Files:**
- Create: `docs/governance-memo.md`

- [ ] **Step 1: 寫 `docs/governance-memo.md`**（全文如下）

````markdown
# 治理／信任設計說明（Governance Gap Memo）

**專案**：Evidence at Source（證據前置）· Track 05 移工數位信任 × Track 06 RBA 合規
**一句話**：關於勞工的事實在發生當下由簽發方與勞工雙簽封存；銀行與品牌的 AI Agent 只能問到答案，拿不到資料。以下逐點回答主辦方六信任點，每點附可執行證據。

## 1. Principal — Agent 代表誰？

Agent A 代表銀行、Agent B 代表品牌；「代表」不是自稱，而是可驗證的憑證鏈：機構是
GLEIF vLEI 憑證鏈上的法人（LEI），Agent 持有該法人簽發的 ECR 授權角色憑證，L0 每次
查詢都重驗整條鏈。
**證據**：`packages/agents/src/vleiBridge.ts`；線上 demo 稽核台「機構信任鏈」面板。

## 2. Authorization — 允許／禁止哪些行為？

機構在 DelegationCredential 上宣告上限（可查型別 boolean/aggregate、憑證範圍、目的、
最低簽發者層級）；勞工在錢包看過範圍後才決定出示（下限）。個體查詢在型別層就不存在
於可授權選項中。
**證據**：`packages/shared/src/delegation.ts`（`AllowedQueryType` 不含 individual）；
錢包授權檢視卡。

## 3. Tool / Action — 需要哪些工具與權限？

原則一：Agent 不該有的能力，對應函式不存在於程式碼中——沒有 approveAccount／
freezeAccount／transferFunds／readTransactionHistory，不是被擋掉，是 grep 不到。
Agent A 只能讀已揭露結論、產生「建議＋原因碼」交人類覆核；Agent B 只能回布林／匯總。
**證據**：`packages/agents/test/principleOne.test.ts`（列舉禁用名單並斷言不存在）。

## 4. Policy Gate — 高風險行為如何管控？

三層閘門 L0→L1→L2：先驗「查的人有沒有資格」（授權＋vLEI 鏈），再驗「資料是否成立」
（簽章／反簽配對／撤銷／層級／產線綁定），最後驗「這個問題能不能問」（拒個體查詢、
k-匿名、差分攻擊偵測、查詢預算）。L0 失敗時勞工資料零讀取——結構保證，測試可證。
**證據**：`runAuthorizedGate` 回呼設計；`packages/agents/test/` 22 個測試檔。

## 5. Audit Log — 行動、決策與授權依據如何記錄？

每次閘門決策寫入稽核軌跡：層級、准駁、原因碼、授權依據（授權憑證雜湊＋ECR 憑證
SAID）。對外可出示可獨立驗簽的查驗收據（何時驗了哪些項目，只含項目名與憑證雜湊）；
查驗日誌反向索引使撤銷可通知所有曾驗證者。
**證據**：`packages/agents/src/auditTrail.ts`、`receipt.ts`；稽核台「稽核軌跡」面板。

## 6. Expiry / Revocation — 何時到期、如何撤銷？

授權預設 24 小時到期。撤銷四路皆即時生效：撤單張憑證、撤勞工主體（離境連動）、撤
Agent 授權、撤 vLEI 鏈上游（GLEIF 撤 QVI 即全生態失效，TEL 事件錨定 KEL 使偽造撤銷
不可行）。demo 每一路都有按鈕可現場演示。
**證據**：`packages/agents/test/revocationPaths.test.ts`、`packages/vlei/test/chain.test.ts`；
`npm run demo:vlei` 撤銷級聯步驟。

---

**總驗證**：GitHub Actions 每次 push 跑 237 個測試＋`npm run demo:vlei`（14 步主張，
exit code 0 即全數成立）；線上 demo <https://zuemen.github.io/evidence-at-source/>，
全部合成資料、無後端、私鑰不離開瀏覽器。
````

- [ ] **Step 2: 驗證與 commit**

逐一確認 memo 內引用的檔案路徑存在（`ls` 每個路徑；`auditTrail.ts` 於 Task 2 建立，先行引用）。

```bash
git add docs/governance-memo.md
git commit -m "docs: governance gap memo covering the six trust points (required deliverable)"
```

---

### Task 2: 統一稽核軌跡（Audit Log 補強）

**Files:**
- Create: `packages/agents/src/auditTrail.ts`
- Modify: `packages/agents/src/index.ts`
- Modify: `packages/web/src/demo/world.ts`
- Modify: `packages/web/src/views/ConsoleView.tsx`
- Test: `packages/agents/test/auditTrail.test.ts`、`packages/web/test/world.test.ts`（加一項）

**Interfaces:**
- Produces:
  - `interface AuditBasis { delegationHash: string | null; ecrSaid: string | null }`
  - `interface AuditEntry { seq: number; at: string; agentRole: string; layer: 'L0' | 'L1' | 'L2'; action: string; decision: 'ALLOW' | 'DENY'; reason: ReasonCode | null; basis: AuditBasis }`
  - `interface AuditTrail { record(entry: Omit<AuditEntry, 'seq' | 'at'>): AuditEntry; entries(): readonly AuditEntry[] }`
  - `createAuditTrail(): AuditTrail`
  - `DemoWorld.auditLog(): readonly AuditEntry[]`；`DemoPayload.audit`。

- [ ] **Step 1: 寫 failing test `packages/agents/test/auditTrail.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { createAuditTrail } from '@eas/agents';

describe('audit trail (six-point framework: Audit Log)', () => {
  test('records decisions in order with seq and timestamp', () => {
    const trail = createAuditTrail();

    const first = trail.record({
      agentRole: 'bank',
      layer: 'L0',
      action: 'boolean:DocumentCustodyCredential',
      decision: 'ALLOW',
      reason: null,
      basis: { delegationHash: 'sha256:abc', ecrSaid: 'E' + 'A'.repeat(43) },
    });
    trail.record({
      agentRole: 'brand',
      layer: 'L2',
      action: 'individual:zWorker001',
      decision: 'DENY',
      reason: 'INDIVIDUAL_QUERY_REJECTED',
      basis: { delegationHash: 'sha256:def', ecrSaid: null },
    });

    const entries = trail.entries();
    expect(first.seq).toBe(1);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.seq).toBe(2);
    expect(entries[1]?.decision).toBe('DENY');
    expect(typeof entries[0]?.at).toBe('string');
  });

  test('a deny entry never carries worker field values, only reason codes', () => {
    const trail = createAuditTrail();
    trail.record({
      agentRole: 'brand',
      layer: 'L2',
      action: 'aggregate:workingHoursComplianceRate',
      decision: 'DENY',
      reason: 'AGGREGATE_BELOW_K_ANONYMITY',
      basis: { delegationHash: null, ecrSaid: null },
    });

    const serialised = JSON.stringify(trail.entries());
    expect(serialised).not.toContain('totalHours');
    expect(serialised).not.toContain('186');
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `npx vitest run packages/agents/test/auditTrail.test.ts`
Expected: FAIL（`createAuditTrail` 不存在）

- [ ] **Step 3: 實作 `packages/agents/src/auditTrail.ts`**

```ts
/**
 * Unified audit trail — the six-point framework's "Audit Log" answer.
 *
 * Every gate decision is recorded with its layer, verdict, reason code and
 * authorization basis (delegation credential hash + ECR credential SAID), so
 * "on whose authority did the agent act, and what did the gate decide" is a
 * queryable record rather than a log-file archaeology. Entries carry reason
 * codes only — never a worker field value.
 */

import type { ReasonCode } from '@eas/shared';

export interface AuditBasis {
  readonly delegationHash: string | null;
  readonly ecrSaid: string | null;
}

export interface AuditEntry {
  readonly seq: number;
  readonly at: string;
  readonly agentRole: string;
  readonly layer: 'L0' | 'L1' | 'L2';
  readonly action: string;
  readonly decision: 'ALLOW' | 'DENY';
  readonly reason: ReasonCode | null;
  readonly basis: AuditBasis;
}

export interface AuditTrail {
  record(entry: Omit<AuditEntry, 'seq' | 'at'>): AuditEntry;
  entries(): readonly AuditEntry[];
}

export function createAuditTrail(): AuditTrail {
  const log: AuditEntry[] = [];

  return {
    record(entry) {
      const full: AuditEntry = { ...entry, seq: log.length + 1, at: new Date().toISOString() };
      log.push(full);
      return full;
    },
    entries: () => log,
  };
}
```

`packages/agents/src/index.ts` 追加：

```ts
export { createAuditTrail } from './auditTrail.js';
export type { AuditBasis, AuditEntry, AuditTrail } from './auditTrail.js';
```

- [ ] **Step 4: 接進 demo world**

`packages/web/src/demo/world.ts`：

- import 區補 `createAuditTrail, type AuditEntry`（自 `@eas/agents`）、`credentialHash`（自 `@eas/shared`，如未引入）。
- `createDemoWorld()` 內（ecosystem 建立後）加：

```ts
  const audit = createAuditTrail();
  const bankBasis = {
    delegationHash: null as string | null,
    ecrSaid: bankAgentVlei.credentials[bankAgentVlei.focus]?.acdc.d ?? null,
  };
  const brandBasis = {
    delegationHash: null as string | null,
    ecrSaid: brandAgentVlei.credentials[brandAgentVlei.focus]?.acdc.d ?? null,
  };
```

（`bankDelegation`／`brandDelegation` 簽出後補 `bankBasis.delegationHash = credentialHash(bankDelegation);`、brand 同理。）

- `split()` 內，bank gate 結果出來後記錄：

```ts
      audit.record({
        agentRole: 'bank',
        layer: bankResult.ok ? 'L1' : 'L0',
        action: 'boolean:DocumentCustodyCredential',
        decision: bankResult.ok && bankResult.worker /* CredentialDecision */ ? 'ALLOW' : 'DENY',
        reason: bankResult.ok ? (bank.refusedWith ?? null) : bankResult.reason,
        basis: bankBasis,
      });
```

實作時以現場變數為準：原則是「L0 拒＝layer L0＋reason；過 L0 但 L1/L2 拒＝對應層＋reason；全過＝ALLOW＋reason null」。brand 側同樣記錄 aggregate 查詢與 individual 查詢（後者永遠 DENY `INDIVIDUAL_QUERY_REJECTED`）。

- `DemoWorld` 介面加 `auditLog(): readonly AuditEntry[];`，實作回 `audit.entries()`；`api.ts` 的 `DemoPayload` 加 `readonly audit: readonly AuditEntry[];`，`currentPayload` 補 `audit: world.auditLog(),`。

- [ ] **Step 5: 稽核台顯示（折疊面板）**

`packages/web/src/views/ConsoleView.tsx`：Props 加 `readonly audit: readonly AuditEntry[];`（App.tsx 傳 `payload.audit`）。split 區塊之後、footnote 之前加：

```tsx
      {audit.length > 0 && (
        <details className="audit-panel">
          <summary>稽核軌跡（{audit.length} 筆）——每次決策的層級、准駁與授權依據</summary>
          <ol className="audit-list">
            {audit.map((entry) => (
              <li key={entry.seq}>
                <span className="badge" data-tone={entry.decision === 'ALLOW' ? 'ok' : 'bad'}>
                  {entry.layer} {entry.decision}
                </span>{' '}
                #{entry.seq} · {entry.agentRole} · {entry.action}
                {entry.reason !== null && <> · {entry.reason}</>}
                {entry.basis.ecrSaid !== null && (
                  <span className="audit-basis"> · ECR {entry.basis.ecrSaid.slice(0, 12)}…</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
```

`styles.css` 追加：

```css
/* ── audit trail panel ────────────────────────────────── */

.audit-panel {
  margin-top: 2rem;
  border: 1px solid var(--line);
  background: var(--paper);
  padding: 0.9rem 1.2rem;
}

.audit-panel summary {
  cursor: pointer;
  font-family: var(--mono);
  font-size: 0.78rem;
  color: var(--text-dim);
}

.audit-list {
  list-style: none;
  padding: 0;
  margin: 0.8rem 0 0;
  font-family: var(--mono);
  font-size: 0.72rem;
  line-height: 2;
}

.audit-list li {
  border-top: 1px dashed var(--line);
  padding: 0.25rem 0;
}

.audit-basis {
  color: var(--text-faint);
}
```

- [ ] **Step 6: world 測試加一項**

```ts
  test('every split query leaves an audit entry with its authorization basis', async () => {
    const world = await createDemoWorld();
    await world.attestAll();
    await world.split();

    const audit = world.auditLog();
    expect(audit.length).toBeGreaterThanOrEqual(2);
    expect(audit.some((entry) => entry.decision === 'DENY' && entry.reason === 'INDIVIDUAL_QUERY_REJECTED')).toBe(true);
    expect(audit.every((entry) => entry.basis.ecrSaid !== null)).toBe(true);
  });
```

- [ ] **Step 7: 全套跑綠 + commit**

Run: `npx vitest run && npm run typecheck`

```bash
git add packages/agents packages/web
git commit -m "feat(agents+web): unified audit trail with authorization basis, surfaced in the console"
```

---

### Task 3: Demo Day 簡報（/slides.html，隨 Pages 上線）

**Files:**
- Create: `packages/web/public/slides.html`

- [ ] **Step 1: 寫單檔簡報**（零依賴、鍵盤←→翻頁、ink/jade 設計語言）

十張內容（每張一個 `<section>`，全文寫入檔案；此處列每張的完整文字內容）：

1. **封面**：Evidence at Source 證據前置｜Track 05 移工數位信任 × Track 06 RBA 合規｜「事實在發生當下雙簽封存，Agent 只能問到答案」｜live demo URL。
2. **問題（35% 場景）**：80 萬移工；近三成曾受詐、逾 17 億；離境帳戶變人頭（一個帳戶 2 萬）；RBA 稽核靠工廠自選資料。共同根因：**出示權在雇主，勞工在證據鏈裡沒有位置**。
3. **解法一頁**：勞工自持雙簽憑證錢包＋兩個機構 Agent；驗證方拿到布林／比率，永遠拿不到原始數字。
4. **六信任點對照**（評審框架逐點命中表：Principal＝vLEI 法人鏈、Authorization＝上限（機構）×下限（勞工）、Tool＝能力不存在（grep 可證）、Policy Gate＝L0→L1→L2、Audit＝軌跡＋可驗簽收據、Expiry/Revocation＝24h＋四路撤銷）。
5. **三層閘門**：先驗查的人、再驗資料、最後驗問題；L0 失敗＝勞工資料零讀取（結構保證）。
6. **vLEI 機構信任鏈**：GLEIF(2-of-3 多簽)→QVI→法人→Agent ECR；上游撤銷即全鏈失效；可攜出示包離線可驗。
7. **我們攻擊自己**：prompt injection 無效（判斷路徑無 LLM）、差分攻擊被擋、SAID 竄改攔截、偽造撤銷因 KEL 錨定不可行。
8. **稽核與撤銷**：稽核軌跡（層級/准駁/授權依據）、查驗收據、撤銷反向通知、離境連動撤銷。
9. **可信度**：237 tests·CI 每次 push 全跑·`npm run demo:vlei` 一條命令 14 步主張 exit 0·全合成資料·私鑰不離開瀏覽器。
10. **收尾**：live demo QR/URL＋「不要相信我們說的任何一句話——請直接跑」。

HTML 骨架（完整寫入，內容照上）：

```html
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Evidence at Source — Demo Day</title>
<style>
  :root { --ink:#0b0e0d; --paper:#141917; --line:#2b332e; --text:#e9e5dc;
    --dim:#97a099; --jade:#5fb89c; --amber:#d59a3c; --rust:#cf6a5b;
    --serif:'Noto Serif TC',Georgia,serif; --mono:'IBM Plex Mono',monospace; }
  * { box-sizing:border-box; } body { margin:0; background:var(--ink); color:var(--text);
    font-family:var(--serif); }
  section { display:none; min-height:100dvh; padding:8vh 10vw; flex-direction:column;
    justify-content:center; gap:1.2rem; }
  section.active { display:flex; }
  h1 { font-size:clamp(2rem,5vw,4rem); margin:0; } h2 { font-size:clamp(1.4rem,3.4vw,2.4rem); margin:0; }
  .kicker { font-family:var(--mono); color:var(--jade); letter-spacing:.2em;
    text-transform:uppercase; font-size:.85rem; }
  p,li { font-size:clamp(1rem,2vw,1.4rem); line-height:1.8; color:var(--dim); }
  strong { color:var(--text); } .huge { font-size:clamp(1.6rem,3.5vw,2.6rem); color:var(--text); }
  table { border-collapse:collapse; font-size:clamp(.85rem,1.6vw,1.1rem); }
  td,th { border:1px solid var(--line); padding:.5em .9em; text-align:left; color:var(--dim); }
  th { color:var(--text); font-family:var(--mono); font-size:.8em; }
  .foot { position:fixed; bottom:1rem; right:1.4rem; font-family:var(--mono);
    font-size:.7rem; color:var(--dim); }
  a { color:var(--jade); }
</style>
</head>
<body>
  <!-- 十張 <section>，第一張 class="active"，內容照上方清單全文 -->
  <div class="foot"><span id="page"></span> · ←→ 翻頁</div>
<script>
  const slides = [...document.querySelectorAll('section')];
  let at = 0;
  function go(n) {
    at = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, i) => s.classList.toggle('active', i === at));
    document.getElementById('page').textContent = (at + 1) + ' / ' + slides.length;
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') go(at + 1);
    if (e.key === 'ArrowLeft') go(at - 1);
  });
  addEventListener('click', () => go(at + 1));
  go(0);
</script>
</body>
</html>
```

- [ ] **Step 2: 本機驗證 + commit**

```bash
cd packages/web && npx vite build && ls dist/slides.html && cd ../..
git add packages/web/public/slides.html
git commit -m "docs(slides): demo day deck served at /slides.html"
```

Expected: `dist/slides.html` 存在（Vite 自動複製 public/）；push 後線上 `/slides.html` 200。

---

### Task 4: 5 分鐘講稿（簡報＋錄影共用）

**Files:**
- Create: `docs/demo-video-script.md`

- [ ] **Step 1: 寫講稿**——與簡報十張一一對應＋live demo 操作指令，總長 5:00：

| 段 | 秒數 | 內容 |
|---|---|---|
| 開場 | 0:00–0:30 | 投影片 1–2：問題與根因（口播詞全文寫入文件） |
| 解法 | 0:30–1:00 | 投影片 3–4：一句話解法＋六信任點表 |
| Live 1 | 1:00–2:00 | 切線上 demo：一鍵導覽第 2、3 幕（反簽封存、錢包驗授權） |
| Live 2 | 2:00–3:00 | 稽核台：同批證據兩種答案；按「機構撤銷」看 L0 零讀取 |
| Live 3 | 3:00–3:45 | 信任鏈面板展開：按「GLEIF 撤銷 QVI」看全鏈塌掉；下載出示包 |
| 攻防 | 3:45–4:20 | 投影片 7：攻擊自己三連發（切攻防頁指認畫面） |
| 收尾 | 4:20–5:00 | 投影片 9–10：237 tests／CI／`npm run demo:vlei`；「請直接跑」 |

文件內每段附：口播詞全文（繁中）、要點按的按鈕、預期畫面、失敗備援（live 掛掉時改講投影片＋預錄影片時間點）。

- [ ] **Step 2: Commit**

```bash
git add docs/demo-video-script.md
git commit -m "docs: five-minute demo day script with live-demo cues and fallbacks"
```

---

### Task 5: README 繳交清單 + 最終回歸

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 文件表之後加「繳交清單」**

```markdown
## 黑客松繳交清單（可信 AI 黑客松 2026）

| 交件 | 位置 |
|---|---|
| 程式碼 | 本 repo（CI 每次 push 跑 237 tests + demo:vlei 閘門） |
| 簡報 | <https://zuemen.github.io/evidence-at-source/slides.html>（←→ 翻頁） |
| Demo | <https://zuemen.github.io/evidence-at-source/>（免安裝）＋導演模式錄影 |
| 治理／信任設計說明 | [`docs/governance-memo.md`](docs/governance-memo.md)（六信任點逐點＋證據） |
| README | 本文件（命題對照見上） |
```

- [ ] **Step 2: 全套回歸 + push + 線上驗證**

```bash
npx vitest run && npm run typecheck
git add README.md
git commit -m "docs: hackathon submission checklist"
git push origin main
gh run watch --exit-status
curl -s -o /dev/null -w "%{http_code}\n" https://zuemen.github.io/evidence-at-source/slides.html
```

Expected: CI 綠；slides.html 線上 200。

---

## Self-Review

**1. Spec coverage** — 必交五件：repo ✓（既有）、簡報＝Task 3、demo 連結✓＋講稿/錄影腳本＝Task 4、Governance Memo＝Task 1、README＝Task 5；六信任點的 Audit 弱點＝Task 2 補強並回饋進 memo 第 5 點與簡報第 8 張。行政事項（報名 8/5 截止、決選全員出席）超出 repo 範圍，於計畫外提醒。

**2. Placeholder scan** — memo 全文、audit trail 代碼與測試、簡報骨架＋十張內容清單、講稿分段表均為實內容；簡報十張的 section 內文於 Task 3 Step 1 內容清單給定全文要點，實作時逐張填入。

**3. Type consistency** — `AuditEntry{seq,at,agentRole,layer,action,decision,reason,basis}` 在 Task 2 測試／實作／world／ConsoleView 一致；`DemoPayload.audit`、`DemoWorld.auditLog()` 命名一致；slides 路徑 `/slides.html` 在 Task 3/5 一致。
