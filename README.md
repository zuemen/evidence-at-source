# Evidence at Source（證據前置）

> 讓「關於勞工的事實」由勞工本人持有，並在事件發生當下就簽章封存，使銀行與品牌的 AI Agent 只能問到答案、拿不到資料。

**專案狀態：Work in progress — hackathon prototype**
2026 可信 AI 黑客松（Trustworthy AI Hackathon）參賽作品。

---

## 問題

台灣有 86 萬移工。以下兩個場景看起來毫不相干，但根因是同一個。

### 場景一：開不了戶，離境後帳戶變人頭

移工在台灣辦金融手續，**40% 曾為同一項手續反覆補件**——因為銀行要的證明分散在仲介、雇主、移民署手上，每一份都得回去要，每一份格式都不一樣。**27% 曾遭詐騙**。更糟的是離境之後：帳戶還開著，卻沒有任何機制知道這個人已經不在境內，於是成為詐團眼中現成的人頭帳戶。

### 場景二：RBA 供應鏈稽核，工廠選擇性出示

國際品牌依 RBA（Responsible Business Alliance）行為準則稽核供應鏈人權，實務上仍靠**紙本與工廠自行提供的檔案**。稽核員看到的，永遠只是工廠**願意給的那一批**。工時表可以事後重製，仲介費收據可以不放進資料夾。

### 共同根因

> **關於勞工的四項事實——仲介費、證件保管、契約同意、工時——全部由雇主單方出示。勞工本人在證據鏈裡沒有位置。**

只要出示權在雇主手上，資料就永遠可以被篩選；只要勞工沒有簽章，紀錄就永遠可以被事後重寫。這不是稽核強度不夠的問題，是證據結構本身的問題。

## 解法

勞工自持的**雙簽憑證錢包**，加上兩個代表不同機構的**查驗 Agent**。

事實在發生的當下就由簽發方與勞工共同簽章封存；查驗時勞工選擇性揭露，Agent 拿到的是布林值或匯總值，不是資料本身。

## 系統架構

```mermaid
flowchart TD
    subgraph ISS["Issuer 簽發方"]
        I1["移民署<br/>在留資格・入出境"]
        I2["仲介公司<br/>仲介費・契約同意"]
        I3["工廠打卡系統<br/>工時・證件保管"]
    end

    W["<b>Worker Wallet 勞工錢包</b><br/>生物辨識綁定<br/>私鑰不離開裝置"]
    ATT["勞工反簽 Attestation<br/>subjectCredentialHash → 憑證雜湊"]
    PAIR["雙簽憑證組<br/>Issuer VC ＋ Worker Attestation"]

    subgraph GATE["Policy Gate 兩層閘門"]
        G1["<b>L1 憑證層</b><br/>簽章・撤銷・有效期<br/>雙簽配對比對"]
        G2["<b>L2 提問層</b><br/>只放行布林／匯總<br/>攔截個體查詢"]
    end

    A["<b>Agent A（代表銀行）</b><br/>建議核准<br/>待人類覆核"]
    B["<b>Agent B（代表品牌）</b><br/>合規：是／否<br/>拒答個體查詢"]
    X1["拒絕並回傳原因碼"]

    I1 -->|簽發 SD-JWT VC| W
    I2 -->|簽發 SD-JWT VC| W
    I3 -->|簽發 SD-JWT VC| W
    W --> ATT
    ATT --> PAIR
    PAIR -->|選擇性揭露出示| G1
    G1 -->|通過| G2
    G1 -.->|ATTESTATION_HASH_MISMATCH<br/>CREDENTIAL_REVOKED …| X1
    G2 --> A
    G2 --> B
    G2 -.->|INDIVIDUAL_QUERY_REJECTED<br/>AGGREGATE_BELOW_K_ANONYMITY| X1
```

資料流一句話：**簽發方簽 → 勞工反簽並自持 → 選擇性揭露 → 兩層閘門 → Agent 只拿到結論。**

## 四張憑證

| 憑證 | 簽發者 | 需勞工反簽 | 公開欄位（可揭露） | 隱藏欄位（選擇性揭露） |
|---|---|---|---|---|
| `RecruitmentFeeCredential` | 仲介公司 | 是 | `feeWithinLegalCap`、`currency`、`contractPeriod` | `feeAmount`、`paymentSchedule`、`lenderName` |
| `DocumentCustodyCredential` | 雇主／工廠 | 是 | `passportHeldByWorker`、`custodyConsentGiven`、`documentType` | `documentHash`、`custodyLocation` |
| `ContractConsentCredential` | 仲介公司 | 是 | `nativeLanguageVersionProvided`、`language`、`consentTimestamp` | `salaryAmount`、`contractDocumentHash` |
| `WorkingHoursCredential` | 工廠打卡系統 | 是 | `withinRBALimit`、`periodStart` | `totalHours`、`overtimeHours` |

完整欄位定義（含「不入憑證」的項目）見 [`docs/credentials.md`](docs/credentials.md)。

## 三個核心機制

### 1. 雙簽配對（Dual-Signature Pairing）

簽發方簽出憑證後，勞工用自己的私鑰簽一張 attestation，其中 `subjectCredentialHash` 指向該憑證的 SHA-256。驗證方檢查兩者是否配對。

雇主事後修改任何一個數字，憑證雜湊就變了，而勞工那張 attestation 指向的仍是舊雜湊——**配對立即失效，且雇主無法偽造新的配對，因為他沒有勞工的私鑰。**

這件事已在 [`poc/dual-signature.mjs`](poc/dual-signature.mjs) 實測跑通。

### 2. 證據前置（Evidence at Source）

不是事後去稽核、去調閱、去比對，而是**在事件發生的當下就把證據封存好**：發薪日當天簽工時、收費當下簽費用、交付證件當下簽保管狀態。

稽核從「事後追查誰說謊」變成「當場驗證簽章是否成立」。這也是專案名稱的來源。

### 3. 防報復的提問邊界（Anti-Retaliation Query Boundary）

這是最容易被忽略、但對移工實際安全最關鍵的一層。

若品牌的 Agent 能問「哪幾位勞工申報了超時」，那麼任何一位勞工的申報都可能導致他被工廠鎖定。**所以系統在架構上就不提供這個能力**：L2 提問層只放行布林值與達到 k-匿名門檻的匯總值，個體查詢一律回 `INDIVIDUAL_QUERY_REJECTED`。

同理，Agent A 代表銀行，但**它沒有核准、拒絕、凍結帳戶或轉帳的能力**——這些函式在程式碼中根本不存在，不是寫出來再用條件擋掉。詳見 [`CLAUDE.md`](CLAUDE.md) 原則一。

## 執行 PoC

```bash
cd poc
npm install
npm run demo:disclosure   # 證明驗證方拿不到原始工時
npm run demo:dualsign     # 證明事後篡改會被偵測
```

需要 Node 22 以上。兩支腳本的預期輸出與說明見 [`poc/README.md`](poc/README.md)。

## 執行測試

```bash
npm install      # 於 repo 根目錄，安裝 workspace 依賴
npm test         # vitest，目前 9 個測試全綠
npm run typecheck
```

已可跑的測試情境：

- **T2 — 誠實流程**：工廠簽發工時憑證 → 勞工反簽 → 選擇性揭露出示 → 驗證方取得 `withinRBALimit`，且配對成立、`totalHours` 不在 payload 中。
- **T4 — 事後篡改**：工廠把 186 小時重簽成 150 小時，勞工原本的反簽配對失效，回 `ATTESTATION_HASH_MISMATCH`。

其中一個關鍵設計來自測試的逼問：反簽的雜湊只涵蓋 **issuer-signed JWT 區段**，不是整串 SD-JWT。若雜湊整串，勞工每次選擇性揭露都會讓配對斷掉；只涵蓋該區段，則因為隱藏欄位的 `_sd` digest 就在裡面，篡改仍然一定被抓到。見 [`packages/shared/src/attestation.ts`](packages/shared/src/attestation.ts)。

## 模組進度

| 模組 | 內容 | 狀態 |
|---|---|---|
| M1 shared | 憑證 schema、原因碼、SD-JWT 封裝、雙簽配對 | ✅ |
| M2 issuer | 依 schema 簽發（撤銷排在 W2） | ✅ 簽發部分 |
| M3 agents | 兩個查驗 Agent、Policy Gate L2 | 未開始 |
| M4 wallet | 勞工錢包 UI | 未開始 |
| M5 console | 稽核台 SplitDemo／RevokeDemo | 未開始 |

## 技術棧

| 層 | 選型 |
|---|---|
| 語言／執行環境 | TypeScript、Node 22 |
| 前端 | React 18 + Vite |
| 憑證格式 | SD-JWT VC（`@sd-jwt/sd-jwt-vc`） |
| 簽章演算法 | ES256（P-256 ECDSA） |
| JWT | `jose` |

## 文件

| 文件 | 內容 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 施工守則：三條不可違反原則 |
| [`docs/credentials.md`](docs/credentials.md) | 四張憑證的完整欄位表 |
| `docs/BUILD-SPEC-開發規格書.md` | 模組拆解與測試情境（尚未入庫） |
| `docs/ADR-001-系統架構與技術選型.md` | 架構決策紀錄（尚未入庫） |
| `docs/技術設計與論點防禦手冊.md` | 對評審提問的技術防禦（尚未入庫） |
| `docs/痛點證據與可解決性評估.md` | 問題的證據基礎（尚未入庫） |

## 資料使用聲明

本專案**全部使用合成資料**，存放於 `fixtures/`。不含任何真實移工的個人資料。

## 授權

MIT — 見 [`LICENSE`](LICENSE)。
