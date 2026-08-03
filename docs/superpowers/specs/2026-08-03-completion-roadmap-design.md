# Evidence at Source — 完成路線圖設計

**目標**：把整個專案推到「完成」——依風險排序，安全的先做、高風險的最後，每一塊都有降級路徑。

**決策**：使用者選定「全部，依風險排序，由我排程」，並指示「一路做到全部完成」。因此本 spec 是一份四塊子專案的完成計畫；每塊各自 TDD、獨立提交、跑完全套測試再進下一塊。

**不可違反的既有約束**（延續 CLAUDE.md）：
- 原則一：不新增任何禁用函式；`principleOne.test.ts` 全程綠燈。
- 原則二：輸出仍只有布林／匯總；不洩漏原始欄位。
- 原則三：合成資料。
- 原則四：Policy Gate 判斷路徑無 LLM。
- 紅線：查證清單 Q1–Q5 有結論前，不動 `RecruitmentFeeCredential` 與交叉驗證論述。

---

## S1 — Demo 收尾 + 錄影就緒（最安全，純前端）

**交付**：一個「導演」流程——一組有序、附旁白的關鍵幕，使用者可逐幕點擊、自控節奏（比計時自動播放更適合錄影且無 async 競態）。每幕：切到正確分頁、（可選）執行動作、顯眼顯示旁白。

**幕腳本**（每幕動作為自足序列，彼此不堆疊）：
1. 四項事實全由雇主單方簽發 → wallet，reset。
2. 證據前置：勞工逐一反簽 → wallet，attestAll。
3. 出示前錢包先驗 Agent 授權 → wallet（授權卡）。
4. 同一批憑證，兩種最小答案 → console，split。
5. 機構撤銷 Agent：L0 當場失效、零讀取 → console，reset+attestAll+revokeAgent(bank)。
6. 離境連動撤銷：全部憑證失效、他人不受影響 → console，reset+attestAll+revokeSubject。
7. 攻防：注入無效、差分被擋、完整性指數 → attack。

**完成定義**：可依序走完全部幕、可重複、畫面一致。可測部分（幕腳本結構）以純資料 + 測試驗證；互動在瀏覽器驗證。
**降級**：不做導演面板，只補每個分頁的導覽標題與旁白文字。

---

## S2 — 研究查證 + 對比矩陣（低-中風險，文件）

**交付**：把痛點數字（`outline.yaml` A1/A2 的反覆補件、受詐比例等）補上可引用來源；產出 C10 差異化對比矩陣（欄：勞工自持／雙簽反簽／選擇性揭露／防個體查詢／事件當下封存；列：本專案 vs Ulula/Issara、Diginex/Sedex、區塊鏈溯源、eKYC、移工金融產品）。矩陣進 README。

**完成定義**：關鍵數字有出處，或明確標「查無可靠來源」；對比矩陣在 README 與 `docs/` 各一份。
**降級**：Web 搜尋受限時，如實標註哪些查不到（延續 P10 誠實態度），不編造數字或來源。

---

## S3 — crypto-browser + 靜態部署（中風險，一體兩面）

**交付**：把 `@sd-jwt/crypto-nodejs` 換成 `@sd-jwt/crypto-browser`，使整個 world 於瀏覽器端執行。同步達成：`vite build` 產出完全靜態、可互動的 demo（不再需要 dev server 與 API middleware）；「私鑰不離開裝置」由誠實註記變為事實。

**技術要點**：
- `attestation.ts` 的同步 `createHash` 與 `credentialHash` 需改為非同步 Web Crypto，`verifyPairing` 已 async 可吸收；`credentialHash` 由 sync 變 async 會波及呼叫點（integrity commitment、cohort、delegation revocation keying），需逐一改為 await。
- SD-JWT 的 signer/hasher 改用 `@sd-jwt/crypto-browser`。
- 前端改為直接在瀏覽器建立 `createDemoWorld()`，移除 `/api` middleware 依賴（保留 middleware 供 dev 亦可）。

**完成定義**：`vite build` 的靜態站可完整互動；全套測試維持綠；README 降級說明改為「私鑰從未離開裝置」。
**降級**：若 `credentialHash` async 化波及過廣、時間不允許，改出「預烘焙狀態」的靜態 build（前端讀取 build 期產生的多份狀態 JSON），保留現有 dev-server demo 與誠實說明。

---

## S4 — Phase 4 錢包端 ZK 對帳（最高風險，最後，明確降級）

**交付**：circom + Rust 工具鏈；電路 `PayrollConsistency`（private: totalHours/overtimeHours/depositedAmount；public: legalWageRate/overtimeMultiplier/toleranceBps + hoursCredentialHash/salaryCredentialHash；output: consistent）。**憑證綁定四項檢查各一測試**：proof 有效、hoursCredentialHash 對應有效未撤銷工時憑證、salaryCredentialHash 對應有效未撤銷薪資憑證、兩張 workerDID 相同。M7 轉為只提供公開參數、驗證證明、匿名匯總——不再接觸明文。

**完成定義**：電路可編譯／產證／驗證；四項綁定檢查各有測試；瀏覽器端可產證（或明確標為降級）。
**降級（8/25 精神）**：工具鏈裝不起來或跑不通即停手，保留 S3 前的伺服器端 M7；demo 畫面相同，差別僅在能否宣稱「我們的伺服器從未看過任何一個數字」。**跑不通不拖累其他模組。**

---

## 執行方式

逐塊 S1→S2→S3→S4；每塊 TDD、獨立提交、`npm test` 全綠 + `tsc --noEmit` 乾淨 + 禁用函式掃描通過再進下一塊；每塊結束回報決策與是否降級。
