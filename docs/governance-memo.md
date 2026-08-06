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
（簽章／反簽配對／撤銷／層級／產線綁定；簽發者公鑰只能來自已驗證的法人 vLEI 鏈，裸金鑰回 `ISSUER_VLEI_MISSING`），最後驗「這個問題能不能問」（拒個體查詢、
k-匿名、差分攻擊偵測、查詢預算）。L0 失敗時勞工資料零讀取——結構保證，測試可證。
**證據**：`runAuthorizedGate` 回呼設計；`packages/agents/test/` 35 個測試檔。

## 5. Audit Log — 行動、決策與授權依據如何記錄？

每次閘門決策寫入稽核軌跡：層級、准駁、原因碼、授權依據（授權憑證雜湊＋ECR 憑證
SAID）。對外可出示可獨立驗簽的查驗收據（何時驗了哪些項目，只含項目名與憑證雜湊）；
查驗日誌反向索引使撤銷可通知所有曾驗證者。
**證據**：`packages/agents/src/auditTrail.ts`、`receipt.ts`；稽核台「稽核軌跡」面板。
對帳的零知識版本已接上真實電路（circom ＋ Groth16）：驗證方只收到 proof 與公開訊號，
工時與入帳金額不在其中，且 Poseidon 承諾使證明必須綁定到憑證裡的那組數字。

## 6. Expiry / Revocation — 何時到期、如何撤銷？

授權預設 24 小時到期。撤銷四路皆即時生效：撤單張憑證、撤勞工主體（離境連動）、撤
Agent 授權、撤 vLEI 鏈上游（GLEIF 撤 QVI 即全生態失效，TEL 事件錨定 KEL 使偽造撤銷
不可行）。demo 每一路都有按鈕可現場演示。
**證據**：`packages/agents/test/revocationPaths.test.ts`、`packages/vlei/test/chain.test.ts`；
`npm run demo:vlei` 撤銷級聯步驟。

---

**總驗證**：GitHub Actions 每次 push 跑 333 個測試＋`npm run demo:vlei`（17 步主張，
exit code 0 即全數成立）；線上 demo <https://zuemen.github.io/evidence-at-source/>，
全部合成資料、無後端、私鑰不離開瀏覽器。
