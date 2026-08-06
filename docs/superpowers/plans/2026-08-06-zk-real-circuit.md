# ZK 真實電路（Poseidon 承諾綁定） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓「勞工在自己裝置上證明工時與入帳一致，驗證方只收到布林結論」從誠實降級變成真的成立——用 Groth16 電路取代 `stubProofVerifier`，並用 Poseidon 承諾把私有數值真正綁到憑證上。

**Architecture:** 簽發方在憑證裡放一個公開的 `valueCommitment = Poseidon(...)` 與一個選擇性揭露的 `commitmentSalt`；勞工出示時揭露承諾、隱藏 salt 與原始數值。circom 電路證明「我知道符合這個承諾的原像，且它們算出的對帳結論是 X」。驗證方拿到的是 proof＋公開訊號，看不到任何數字。既有的四項憑證綁定檢查（有效／未撤銷／同一勞工／雜湊相符）留著，新增的是**數值層級**的綁定。

**Tech Stack:** circom 2.2.3（官方預編譯執行檔）、circomlib Poseidon、snarkjs 0.7.6 Groth16、circomlibjs（JS 端同一個 Poseidon）、TypeScript、vitest

## Global Constraints

- **語言慣例**：文件／README／Markdown 內文一律**繁體中文**；程式碼註解、變數名、函式名、commit message 一律**英文**。
- **CLAUDE.md 三原則**：禁用函式不得存在、只回布林／匯總、全合成資料。
- **憑證欄位變更必須先改 `docs/credentials.md`**（Task 1 就是做這件事，使用者已於本次對話明確同意新增承諾欄位）。
- **不得加入繞過 Policy Gate 的測試後門**；證明無效時一律 fail-closed。
- **不得在錯誤訊息裡洩漏被隱藏的欄位值**——ZK 的重點就是那些值不存在於輸出中。
- **不得改動 `poc/` 下兩支腳本**。
- `packages/shared/test/docsConsistency.test.ts` 會檢查 README／governance-memo／slides／demo-video-script 的測試數與測試檔數，以及 README 每條路徑引用——**每次增減測試都要同步那四份文件**。
- 每個 Task 結束前 `npm test` 與 `npm run typecheck` 都必須乾淨。

## 基準事實（本計畫撰寫時實測，2026-08-06）

| 事實 | 實測值 |
|---|---|
| 測試總數 | **252** |
| `packages/agents/test/*.test.ts` 檔數 | **29** |
| circom | v2.2.3 Windows 預編譯檔可執行（放 scratchpad，**不進 repo**） |
| snarkjs | 0.7.6，npm 可裝 |
| Groth16 全鏈 | compile → ptau → setup → prove → verify 已實測 `OK!` |
| powers of tau | **可本機產生**（`snarkjs powersoftau new bn128 8`），不需下載 9MB 檔案 |
| Poseidon 一致性 | circomlibjs 與 circomlib 電路輸出**位元級相同**（已實測同一 field element） |
| 對帳公式 | `expectedPay = (totalHours − overtimeHours) × legalWageRate + overtimeHours × legalWageRate × overtimeMultiplier`；容差 `expectedPay × toleranceBps / 10000` |
| **本計畫的電路已在 spike 全程實測** | 1274 wires；T10 情境（150h／10ot／38000）電路輸出 `verdict=2 OVERPAID`，與 `reconcile()` 逐字相符；`groth16 verify` 回 `OK!`；產出物合計 2.64 MB |
| powers of tau 所需大小 | **2^12**（2^8 會報 `circuit too big for this power of tau ceremony`） |
| circom 約束次數限制 | 只接受**二次**約束——三個 signal 相乘會編譯失敗，電路已拆成中間 signal |

## 最關鍵的設計風險：浮點數

`DEFAULT_RECONCILIATION_PARAMS.overtimeMultiplier = 1.34` 是**浮點數**，電路只能做有限體上的整數運算。若電路與 `reconcile()` 各算各的，邊界值上兩者會不一致——那會是比沒有 ZK 更糟的狀況（同一份證據兩條路徑給出不同結論）。

對策：電路全程用**放大整數**且**完全不做除法**，比較式兩邊同乘：

```
expectedPayScaled = (totalHours − overtimeHours) × legalWageRate × 10000
                  + overtimeHours × legalWageRate × overtimeMultiplierBps
underpaid  ⟺  deposit × 10000 × 10000 <  expectedPayScaled × (10000 − toleranceBps)
overpaid   ⟺  deposit × 10000 × 10000 >  expectedPayScaled × (10000 + toleranceBps)
```

`overtimeMultiplierBps = 13400`。量級估算：`expectedPayScaled ≈ 186×190×10⁴ ≈ 3.5×10⁸`，乘 11500 後約 `4×10¹²`，遠小於 `2⁶⁴`，用 64-bit 比較器安全，也遠小於 BN254 體。

Task 3 有一個專門的等價測試，在**邊界值**上逐一比對電路與 `reconcile()` 的結論。

## 不在本計畫範圍

- 瀏覽器端產生證明的效能最佳化（先確認能跑、大小可接受即可）。
- 其他三張憑證（仲介費／證件／契約）的承諾欄位——本計畫只動對帳用到的兩張。

---

## File Structure

| 檔案 | 建立／修改 | 責任 |
|---|---|---|
| `docs/credentials.md` | 修改 | 欄位定義的唯一來源；先改這裡才動程式碼 |
| `packages/shared/src/commitment.ts` | 建立 | 唯一責任：Poseidon 承諾的計算與 salt 產生。JS 端與電路的橋，兩者必須算出同一個值 |
| `packages/shared/src/index.ts` | 修改 | 匯出承諾 API |
| `packages/issuer/src/issuer.ts` | 修改 | 簽發時計算並寫入 `valueCommitment`／`commitmentSalt` |
| `circuits/reconciliation.circom` | 建立 | 電路本體：Poseidon 原像 ＋ 放大整數區間比較 |
| `circuits/build.mjs` | 建立 | 唯一責任：compile → ptau → setup → 匯出 vkey 與 wasm/zkey。可重跑、輸出到 `circuits/build/` |
| `circuits/README.md` | 建立 | 如何取得 circom、如何重建、產出物哪些進 repo |
| `packages/agents/src/zkReconciliation.ts` | 修改 | 用 snarkjs 的 groth16 verify 取代 stub；維持 fail-closed |
| `packages/agents/test/zkCircuit.test.ts` | 建立 | 電路與 `reconcile()` 的等價性＋偽造證明被拒 |
| `README.md`／`docs/zk-reconciliation.md`／`docs/governance-memo.md`／簡報／講稿 | 修改 | 把「誠實降級」改寫為實際成立的主張 |

---

### Task 1: 憑證欄位定義（文件先行）

CLAUDE.md：「實作時發現少了欄位——**先改文件、確認過再改程式碼**」。使用者已同意新增承諾欄位，本 Task 只動文件，不動程式碼，讓 schema 變更留下獨立可審的紀錄。

**Files:**
- Modify: `docs/credentials.md`

**Interfaces:**
- Consumes: 無
- Produces: 欄位名稱 `valueCommitment`（公開）與 `commitmentSalt`（隱藏），供 Task 2、3 實作

- [ ] **Step 1: 在憑證欄位表加入兩個欄位**

`docs/credentials.md` 的 `WorkingHoursCredential` 與 `SalaryDepositCredential` 兩節，各加入：

| 欄位 | 揭露性 | 說明 |
|---|---|---|
| `valueCommitment` | **公開** | `Poseidon` 承諾，綁定本憑證的數值欄位。出示時一定揭露——驗證方需要它當作證明的公開輸入 |
| `commitmentSalt` | **隱藏** | 承諾的隨機遮罩。只有勞工持有；揭露它等同揭露原始數值，因此永遠放在 `_sd` |

並在該節下方加入一段說明：

```markdown
**為什麼需要承諾**：零知識證明可以證明「我知道一組算得出一致的數字」，但那不等於「那組數字就是這張憑證裡的數字」。承諾欄位補上這一段：簽發方在簽發當下就把數值雜湊進 `valueCommitment`，電路必須證明它知道符合該承諾的原像。沒有承諾，證明對任意數字都成立，也就毫無意義。

`commitmentSalt` 必須是隱藏欄位。工時的取值範圍很小（一個月最多幾百小時），沒有遮罩的話任何人都能用暴力枚舉反推出 `valueCommitment` 的原像。
```

- [ ] **Step 2: Commit**

```bash
git add docs/credentials.md
git commit -m "docs(credentials): commitment fields for the reconciliation proof"
```

---

### Task 2: Poseidon 承諾與簽發端接線

**Files:**
- Create: `packages/shared/src/commitment.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/issuer/src/issuer.ts`
- Create: `packages/shared/test/commitment.test.ts`

**Interfaces:**
- Consumes: `circomlibjs` 的 `buildPoseidon`
- Produces:
  - `export async function poseidonCommit(values: readonly bigint[]): Promise<string>` — 回傳十進位字串的 field element
  - `export function randomSalt(): bigint`
  - 憑證新增欄位 `valueCommitment: string`、`commitmentSalt: string`

- [ ] **Step 1: 安裝依賴**

```bash
npm install circomlibjs --workspace @eas/shared
```

- [ ] **Step 2: 寫下會失敗的測試**

建立 `packages/shared/test/commitment.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { poseidonCommit, randomSalt } from '@eas/shared';

describe('poseidon commitment', () => {
  test('the same inputs always commit to the same value', async () => {
    const a = await poseidonCommit([186n, 42n, 12345n]);
    const b = await poseidonCommit([186n, 42n, 12345n]);

    expect(a).toBe(b);
    // Pinned against the circuit: circomlib's Poseidon(3) over the same inputs.
    // If this changes, the JS side and the circuit have diverged and every
    // proof will fail to verify.
    expect(a).toBe(
      '9004221170960342108411548874718178450489702326188007106947769597241530808458',
    );
  });

  test('changing any input changes the commitment', async () => {
    const base = await poseidonCommit([186n, 42n, 12345n]);

    expect(await poseidonCommit([150n, 42n, 12345n])).not.toBe(base);
    expect(await poseidonCommit([186n, 10n, 12345n])).not.toBe(base);
    expect(await poseidonCommit([186n, 42n, 99999n])).not.toBe(base);
  });

  test('salts do not repeat', () => {
    const salts = new Set(Array.from({ length: 64 }, () => randomSalt()));

    expect(salts.size).toBe(64);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

執行：`npx vitest run packages/shared/test/commitment.test.ts`
預期：FAIL，`does not provide an export named 'poseidonCommit'`。

- [ ] **Step 4: 實作**

建立 `packages/shared/src/commitment.ts`：

```ts
/**
 * The bridge between this repo's TypeScript and the circom circuit.
 *
 * A zero-knowledge proof that some numbers reconcile says nothing unless those
 * numbers are the ones inside the credential. The issuer commits to them at
 * issuance; the circuit proves it knows a preimage of that commitment. Both
 * sides must compute the identical Poseidon hash — the pinned vector in
 * commitment.test.ts is what catches divergence.
 */

import { buildPoseidon } from 'circomlibjs';

type Poseidon = Awaited<ReturnType<typeof buildPoseidon>>;

let poseidonPromise: Promise<Poseidon> | null = null;

function poseidon(): Promise<Poseidon> {
  // Built once: construction is expensive and the instance is stateless.
  poseidonPromise ??= buildPoseidon();
  return poseidonPromise;
}

export async function poseidonCommit(values: readonly bigint[]): Promise<string> {
  const p = await poseidon();
  return p.F.toString(p([...values]));
}

/**
 * Working hours span a small range, so an unmasked commitment could be brute
 * forced. The salt is what makes the commitment hiding.
 */
export function randomSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  return BigInt(`0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
}
```

在 `packages/shared/src/index.ts` 追加：

```ts
export { poseidonCommit, randomSalt } from './commitment.js';
```

- [ ] **Step 5: 跑測試確認轉綠**

執行：`npx vitest run packages/shared/test/commitment.test.ts`
預期：3 passed。若第一個測試的釘選值不符，**停下來**——代表 circomlibjs 版本換了 Poseidon 參數，電路那側也要一起換，不可以直接改期望值。

- [ ] **Step 6: 簽發端寫入承諾**

`packages/issuer/src/issuer.ts` 的 `issue()`，在組 claims 時，若憑證型別是 `WorkingHoursCredential` 或 `SalaryDepositCredential`，加入承諾與 salt。先執行 `grep -n "issuerTier: tier" packages/issuer/src/issuer.ts` 找到組 claims 的位置，在同一個物件字面量內加入：

```ts
        ...(await commitmentFieldsFor(type, claims)),
```

並在該檔案上方加入輔助函式：

```ts
/**
 * Only the two credentials the reconciliation proof consumes carry a
 * commitment. Adding it everywhere would mean every credential pays for a
 * feature only these two use.
 */
async function commitmentFieldsFor(
  type: string,
  claims: Record<string, unknown>,
): Promise<Record<string, string>> {
  const salt = randomSalt();

  if (type === 'WorkingHoursCredential') {
    const commitment = await poseidonCommit([
      BigInt(Number(claims['totalHours'])),
      BigInt(Number(claims['overtimeHours'])),
      salt,
    ]);
    return { valueCommitment: commitment, commitmentSalt: salt.toString() };
  }
  if (type === 'SalaryDepositCredential') {
    const commitment = await poseidonCommit([
      BigInt(Number(claims['depositedAmountTWD'])),
      salt,
    ]);
    return { valueCommitment: commitment, commitmentSalt: salt.toString() };
  }

  return {};
}
```

並確認 `commitmentSalt` 被列入該憑證的**隱藏欄位**清單（`_sd`）。執行 `grep -n "totalHours\|overtimeHours" packages/shared/src/credentialSchema.ts` 找到隱藏欄位定義處，把 `commitmentSalt` 加進去，`valueCommitment` 則留在公開欄位。

- [ ] **Step 7: 跑全部測試並同步文件數字**

執行：`npm test`
預期：`Tests 255 passed (255)`（252 ＋ 3）。以實測為準。

把 `README.md`、`docs/governance-memo.md`、`packages/web/public/slides.html`、`docs/demo-video-script.md` 的測試數改為實測值；`docs/governance-memo.md` 的測試檔數改為 `29 個測試檔`（本 Task 的新測試在 `packages/shared/test/`，不影響 agents 檔數）。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(shared): poseidon commitments bound at issuance"
```

---

### Task 3: 電路與建置管線

**Files:**
- Create: `circuits/reconciliation.circom`
- Create: `circuits/build.mjs`
- Create: `circuits/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 2 的承諾定義（工時＝`Poseidon(totalHours, overtimeHours, salt)`；薪資＝`Poseidon(deposit, salt)`）
- Produces: `circuits/build/reconciliation.wasm`、`reconciliation.zkey`、`verification_key.json`

- [ ] **Step 1: 寫電路**

建立 `circuits/reconciliation.circom`：

```circom
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/*
 * Proves, without revealing any figure:
 *   1. the prover knows the values behind both credentials' commitments, and
 *   2. those values produce a specific reconciliation verdict.
 *
 * Everything is scaled integer arithmetic with no division: the TypeScript
 * reconcile() uses a floating point multiplier, and a circuit that rounded
 * differently would disagree with the server on boundary cases — which is
 * worse than having no circuit at all.
 */
template Reconciliation() {
    // Private — never leaves the worker's device.
    signal input totalHours;
    signal input overtimeHours;
    signal input hoursSalt;
    signal input deposit;
    signal input salarySalt;

    // Public — the verifier already has all of these.
    signal input hoursCommitment;
    signal input salaryCommitment;
    signal input legalWageRate;
    signal input overtimeMultiplierBps;
    signal input toleranceBps;

    // Public output: 0 consistent, 1 underpaid, 2 overpaid.
    signal output verdict;

    // 1 — the values are the ones the issuer committed to.
    component hoursHash = Poseidon(3);
    hoursHash.inputs[0] <== totalHours;
    hoursHash.inputs[1] <== overtimeHours;
    hoursHash.inputs[2] <== hoursSalt;
    hoursHash.out === hoursCommitment;

    component salaryHash = Poseidon(2);
    salaryHash.inputs[0] <== deposit;
    salaryHash.inputs[1] <== salarySalt;
    salaryHash.out === salaryCommitment;

    // 2 — the same comparison reconcile() makes, scaled to integers.
    signal normalHours;
    normalHours <== totalHours - overtimeHours;

    signal expectedScaled;
    expectedScaled <== normalHours * legalWageRate * 10000
                     + overtimeHours * legalWageRate * overtimeMultiplierBps;

    signal depositScaled;
    depositScaled <== deposit * 100000000;

    signal lowerBound;
    lowerBound <== expectedScaled * (10000 - toleranceBps);

    signal upperBound;
    upperBound <== expectedScaled * (10000 + toleranceBps);

    component below = LessThan(64);
    below.in[0] <== depositScaled;
    below.in[1] <== lowerBound;

    component above = GreaterThan(64);
    above.in[0] <== depositScaled;
    above.in[1] <== upperBound;

    // below → 1, above → 2, otherwise 0. The two can never both be true.
    verdict <== below.out + 2 * above.out;
}

component main {public [
    hoursCommitment,
    salaryCommitment,
    legalWageRate,
    overtimeMultiplierBps,
    toleranceBps
]} = Reconciliation();
```

- [ ] **Step 2: 寫建置腳本**

建立 `circuits/build.mjs`：

```js
/**
 * Rebuilds the proving and verifying material from source.
 *
 * Powers of tau is generated locally rather than downloaded: the circuit is
 * small enough that a 2^12 ceremony takes seconds, and one fewer external
 * artifact is one fewer thing a reviewer has to trust. This is a demo-grade
 * setup — a production deployment needs a real multi-party ceremony, and
 * circuits/README.md says so.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, 'build');
const circom = process.env['CIRCOM'] ?? 'circom';

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: here, stdio: 'inherit', shell: process.platform === 'win32' });

mkdirSync(build, { recursive: true });

run(circom, [
  'reconciliation.circom',
  '--r1cs',
  '--wasm',
  '-l',
  join(here, '..', 'node_modules'),
  '-o',
  build,
]);

const snarkjs = ['npx', 'snarkjs'];
const pot = join(build, 'pot12_final.ptau');

if (!existsSync(pot)) {
  run(snarkjs[0], [snarkjs[1], 'powersoftau', 'new', 'bn128', '12', join(build, 'pot12_0.ptau')]);
  run(snarkjs[0], [snarkjs[1], 'powersoftau', 'contribute', join(build, 'pot12_0.ptau'), join(build, 'pot12_1.ptau'), '--name=demo', '-e=synthetic entropy, demo grade']);
  run(snarkjs[0], [snarkjs[1], 'powersoftau', 'prepare', 'phase2', join(build, 'pot12_1.ptau'), pot]);
}

run(snarkjs[0], [snarkjs[1], 'groth16', 'setup', join(build, 'reconciliation.r1cs'), pot, join(build, 'reconciliation_0.zkey')]);
run(snarkjs[0], [snarkjs[1], 'zkey', 'contribute', join(build, 'reconciliation_0.zkey'), join(build, 'reconciliation.zkey'), '--name=demo', '-e=more synthetic entropy']);
run(snarkjs[0], [snarkjs[1], 'zkey', 'export', 'verificationkey', join(build, 'reconciliation.zkey'), join(build, 'verification_key.json')]);

console.log('circuit build complete:', build);
```

在根 `package.json` 的 `scripts` 加入：

```json
    "build:circuit": "node circuits/build.mjs",
```

- [ ] **Step 3: 安裝電路依賴並建置**

```bash
npm install circomlib snarkjs
CIRCOM="C:/Users/sanketsu/AppData/Local/Temp/claude/C--Users-sanketsu/054a883d-35fc-468e-9120-d46f999ff31c/scratchpad/tools/circom.exe" npm run build:circuit
```

預期：`circuit build complete`。

- [ ] **Step 4: 量產出物大小並決定哪些進 repo**

```bash
ls -la circuits/build | awk '{print $5, $9}'
```

**已在 spike 實測過同一個電路的產出物大小**：`zkey` 0.57 MB、`wasm` 2.07 MB、`verification_key.json` 約 3 KB，合計 **2.64 MB**。低於 5MB 門檻，因此三者**全部進 repo**，線上 demo 免建置即可產生與驗證證明。

仍執行本步驟量測是為了確認電路沒有在 Task 3 Step 1 被改大；若合計超過 5MB，改為不進 repo、`.gitignore` 排除，並在 `circuits/README.md` 寫明要跑 `npm run build:circuit`，demo 端缺檔時顯示「證明後端未建置」而不是假裝成功。

把決定寫進 `.gitignore`：若不進 repo，加入

```
circuits/build/*.ptau
circuits/build/*.r1cs
circuits/build/reconciliation_0.zkey
```

（`.ptau`、`.r1cs`、中間 zkey **一律不進 repo**，它們可重建且很大。）

- [ ] **Step 5: 寫 circuits/README.md**

```markdown
# 對帳電路

## 取得 circom

本 repo 不含 circom 執行檔。從 <https://github.com/iden3/circom/releases>（v2.2.3）
下載對應平台的預編譯檔，或以 Rust 自行 build。

## 重建

    CIRCOM=/path/to/circom npm run build:circuit

產出在 `circuits/build/`。

## 這個 setup 的誠實界限

powers of tau 與 zkey 的 contribution 都是**本機單方產生**的，屬 demo 等級。
正式部署需要多方參與的可信設定儀式——單方 setup 意味著執行 setup 的人若保留了
toxic waste，就能偽造證明。本專案的主張止於「伺服器不再看到數字」，不包含
「這個 setup 可以信任到上線」。
```

- [ ] **Step 6: Commit**

```bash
git add circuits .gitignore package.json package-lock.json
git commit -m "feat(circuits): groth16 reconciliation circuit with commitment binding"
```

---

### Task 4: 接上驗證，讓 stub 消失

**Files:**
- Modify: `packages/agents/src/zkReconciliation.ts`
- Create: `packages/agents/test/zkCircuit.test.ts`

**Interfaces:**
- Consumes: `circuits/build/verification_key.json`、snarkjs `groth16.verify`
- Produces: `zkReconciliation` 的 `verifyProof` 預設改為真實驗證器

- [ ] **Step 1: 寫下等價性與偽造測試**

建立 `packages/agents/test/zkCircuit.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { groth16 } from 'snarkjs';
import { poseidonCommit } from '@eas/shared';
import { DEFAULT_RECONCILIATION_PARAMS, reconcile } from '@eas/reconciliation';

const BUILD = fileURLToPath(new URL('../../../circuits/build/', import.meta.url));
const wasm = join(BUILD, 'reconciliation_js', 'reconciliation.wasm');
const zkey = join(BUILD, 'reconciliation.zkey');
const built = existsSync(wasm) && existsSync(zkey);

/** The verdict codes the circuit emits, in the circuit's own numbering. */
const VERDICT = ['CONSISTENT', 'DISCREPANCY_UNDERPAID', 'DISCREPANCY_OVERPAID'] as const;

async function proveVerdict(totalHours: number, overtimeHours: number, deposit: number) {
  const hoursSalt = 111n;
  const salarySalt = 222n;
  const input = {
    totalHours,
    overtimeHours,
    hoursSalt: hoursSalt.toString(),
    deposit,
    salarySalt: salarySalt.toString(),
    hoursCommitment: await poseidonCommit([BigInt(totalHours), BigInt(overtimeHours), hoursSalt]),
    salaryCommitment: await poseidonCommit([BigInt(deposit), salarySalt]),
    legalWageRate: DEFAULT_RECONCILIATION_PARAMS.legalWageRate,
    overtimeMultiplierBps: Math.round(DEFAULT_RECONCILIATION_PARAMS.overtimeMultiplier * 10000),
    toleranceBps: DEFAULT_RECONCILIATION_PARAMS.toleranceBps,
  };

  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);
  const vkey = JSON.parse(readFileSync(join(BUILD, 'verification_key.json'), 'utf8'));

  return { proof, publicSignals, vkey, verdict: VERDICT[Number(publicSignals[0])] };
}

describe.skipIf(!built)('the circuit agrees with reconcile() and cannot be faked', () => {
  // Boundary cases matter most: this is where a rounding difference between the
  // floating point reference and the scaled integer circuit would show up.
  const CASES = [
    { hours: 186, overtime: 42, deposit: 38000 },
    { hours: 150, overtime: 10, deposit: 38000 },
    { hours: 186, overtime: 42, deposit: 1000 },
    { hours: 200, overtime: 0, deposit: 38000 },
    { hours: 100, overtime: 100, deposit: 25460 },
  ];

  for (const c of CASES) {
    test(`${c.hours}h/${c.overtime}ot/${c.deposit}TWD matches the reference`, async () => {
      const expected = reconcile(
        { totalHours: c.hours, overtimeHours: c.overtime },
        { depositedAmountTWD: c.deposit },
        DEFAULT_RECONCILIATION_PARAMS,
      );
      const { verdict, proof, publicSignals, vkey } = await proveVerdict(
        c.hours,
        c.overtime,
        c.deposit,
      );

      expect(verdict).toBe(expected.code);
      expect(await groth16.verify(vkey, publicSignals, proof)).toBe(true);
    }, 60_000);
  }

  test('a proof does not verify against altered public signals', async () => {
    const { proof, publicSignals, vkey } = await proveVerdict(186, 42, 38000);
    const tampered = [...publicSignals];
    tampered[1] = '1';

    expect(await groth16.verify(vkey, tampered, proof)).toBe(false);
  }, 60_000);

  test('the figures are not among the public signals', async () => {
    const { publicSignals } = await proveVerdict(186, 42, 38000);

    // Exactly: verdict, the two commitments, and the three public parameters.
    expect(publicSignals).toHaveLength(6);
    expect(publicSignals).not.toContain('186');
    expect(publicSignals).not.toContain('42');
    expect(publicSignals).not.toContain('38000');

    // Deliberately NOT a substring check over the serialized proof: field
    // elements are 77-digit numbers, so "186" appears inside them by chance and
    // such a test would fail at random. The guarantee is that no private figure
    // is a public output, which is what is asserted above.
  }, 60_000);
});
```

- [ ] **Step 2: 跑測試**

執行：`npx vitest run packages/agents/test/zkCircuit.test.ts`

預期：若 Task 3 已建置成功，8 個 test 全過。**若「與參考實作一致」的案例失敗，停下來**——那正是浮點與整數的分歧，要修的是電路或參數換算，不是把期望值改掉。若電路產出物不存在，測試會被 `describe.skipIf` 跳過（CI 沒有 circom 時的正確行為）。

- [ ] **Step 3: 接上真實驗證器**

`packages/agents/src/zkReconciliation.ts`，把：

```ts
export const stubProofVerifier: ProofVerifier = () => false;
```

改為保留 stub（作為缺後端時的 fail-closed 預設），並新增：

```ts
/**
 * The real verifier. Kept as an explicit export rather than the default so a
 * caller with no verification key still fails closed instead of silently
 * accepting: a missing backend must never look like a valid proof.
 */
export function createGroth16Verifier(verificationKey: unknown): ProofVerifier {
  return async (proof, publicSignals) => {
    const { groth16 } = await import('snarkjs');
    try {
      return await groth16.verify(verificationKey, publicSignals as string[], proof);
    } catch {
      return false;
    }
  };
}
```

並在 `packages/agents/src/index.ts` 匯出 `createGroth16Verifier`。

- [ ] **Step 4: 跑全部測試並同步文件數字**

執行：`npm test` 與 `npm run typecheck`，皆須乾淨。把四份文件的測試數改為實測值，`docs/governance-memo.md` 的測試檔數改為 `30 個測試檔`。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agents): verify reconciliation proofs against the real circuit"
```

---

### Task 5: 把「誠實降級」改寫成實際成立的主張

**Files:**
- Modify: `README.md`
- Modify: `docs/zk-reconciliation.md`
- Modify: `docs/governance-memo.md`

**Interfaces:**
- Consumes: Task 3、4 的實際產出
- Produces: 無程式介面

- [ ] **Step 1: 改寫 README 的 ZK 段落**

`README.md` 的「**誠實降級**」整段，改為：

```markdown
**現況**：電路已實作並接上（circom 2.2.3 ＋ Groth16）。承諾綁定使數值層級的宣稱第一次成立——電路必須證明它知道符合憑證上 `valueCommitment` 的原像，因此「證明的是這張憑證裡的數字」不再是要求別人相信的事。重建方式見 [`circuits/README.md`](circuits/README.md)。

**仍然誠實標註的界限**：可信設定（powers of tau 與 zkey contribution）是本機單方產生的 demo 等級儀式。正式部署需要多方參與——單方 setup 若保留 toxic waste 就能偽造證明。本專案主張的是「伺服器不再看到數字」，不包含「這個 setup 可以信任到上線」。
```

- [ ] **Step 2: 更新 `docs/zk-reconciliation.md`**

把該文件中描述「尚未接上電路」「預設 stub 一律拒絕」的段落，改為描述實際電路：私有輸入五個、公開輸入五個、輸出 verdict 三態、以及放大整數不做除法的理由（浮點分歧）。保留 fail-closed 的說明——`stubProofVerifier` 仍是預設。

- [ ] **Step 3: 更新治理說明**

`docs/governance-memo.md` 第 2 節（Authorization）或第 4 節（Policy Gate）中提到 ZK 的部分，補一句：

```
對帳的零知識版本已接上真實電路：驗證方只收到 proof 與公開訊號，工時與入帳金額不在其中。
```

- [ ] **Step 4: 跑測試並 Commit**

執行：`npm test`（守門測試會檢查 README 路徑引用——`circuits/README.md` 必須存在）。

```bash
git add -A
git commit -m "docs: the reconciliation proof is real; the ceremony is still demo grade"
```

---

## 完成後的狀態

| 項目 | 狀態 |
|---|---|
| `stubProofVerifier` 是唯一的驗證路徑 | ✅ 已有真實 Groth16 驗證器，stub 降為 fail-closed 預設 |
| 數值與憑證的綁定 | ✅ Poseidon 承諾，電路強制原像相符 |
| 電路與 `reconcile()` 邊界值不一致的風險 | ✅ 放大整數不做除法＋等價性測試 |
| 可信設定 | ⚠️ 單方 demo 等級，已在三處文件明寫 |
| 瀏覽器端產生證明 | ⚠️ 依 Task 3 Step 4 的大小判定；超過 5MB 則需建置後才可用 |
