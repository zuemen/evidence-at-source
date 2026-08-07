# 治理／信任設計說明（Governance Gap Memo）

**專案**：Evidence at Source（證據前置）· Track 05 移工數位信任 × Track 06 RBA 合規

## 核心主張：一個 AI Agent 憑什麼可信

不是因為它表現良好，也不是因為我們在 prompt 裡叮嚀過它。**一個 Agent 的可信度，等於它所依賴的每一樣東西的可信度**——而那些東西在多數系統裡是設定檔、名單、和「我們有記錄」。

所以我們把 Agent 周圍的四件事全部換掉：

| Agent 的四個信任問題 | 一般做法 | 本專案 |
|---|---|---|
| **憑什麼說它代表這家機構？** | 設定檔裡的公鑰名單 | GLEIF vLEI 憑證鏈上的 ECR 角色，L0 每次查詢重驗全鏈 |
| **它能做什麼、不能做什麼？** | prompt 約束＋條件判斷 | 不該有的能力**函式不存在**；可查型別在型別層就排除個體查詢 |
| **誰能在什麼時候停掉它？** | 改設定、重新部署 | 四條撤銷路徑即時生效，且**沒有任何快取**——撤銷是鏈的結果，不是誰去同步了名單 |
| **事後誰查得動它？** | 一份持有者可以編輯的日誌 | 雜湊鏈接＋簽章的稽核軌跡，**挑戰方可用鏈上公鑰獨立重驗** |

**而最關鍵的一條是：Agent 永遠不做決定。** 它只產生「建議＋原因碼」，由一個**同樣掛在鏈上、同樣可撤銷**的自然人（OOR 職務憑證）覆核。系統裡唯一能拍板的角色，是一個離職後就簽不動的人。

以下逐點回答主辦方六信任點，每點附可執行證據。

## 1. Principal — Agent 代表誰？

Agent A 代表銀行、Agent B 代表品牌；「代表」不是自稱，而是可驗證的憑證鏈：機構是
GLEIF vLEI 鏈上的法人（LEI），Agent 持有該法人簽發的 ECR 授權角色憑證，L0 每次查詢
重驗整條鏈。**連機構本身的份量也不是自稱**——簽發者層級（T1 自我聲明／T2 第三方／
T3 主管機關）由 QVI 寫進法人憑證，機構在自己的憑證裡報得比鏈上高就是
`ISSUER_TIER_MISMATCH`；聲稱有第三方背書時，那個稽核機構必須解析得到一條有效的
鏈，否則 `AUDITOR_CHAIN_INVALID`。
**證據**：`packages/agents/src/vleiBridge.ts`、`auditorDirectory.ts`；
`test/chainTier.test.ts`、`test/auditorChain.test.ts`；稽核台「治理鏈」面板。

## 2. Authorization — 允許／禁止哪些行為？

機構在 DelegationCredential 上宣告上限（可查型別 boolean/aggregate、憑證範圍、目的、
最低簽發者層級）；勞工在錢包看過範圍後才決定出示（下限）。個體查詢在型別層就不存在
於可授權選項中。**而當 Agent 查的是一個人時，還要再過一關**：那個錢包必須仍是綁在
這個人身分錨上的唯一有效錢包（`WORKER_IDENTITY_UNBOUND`），且反簽當下裝置驗證器
確實驗過使用者（`USER_PRESENCE_NOT_VERIFIED`）——否則仲介拿走手機就等於成為那個人。
**證據**：`packages/shared/src/delegation.ts`（`AllowedQueryType` 不含 individual）、
`identity.ts`；`test/identityBinding.test.ts`；錢包授權檢視卡。

## 3. Tool / Action — 需要哪些工具與權限？

原則一：Agent 不該有的能力，對應函式不存在於程式碼中——沒有 approveAccount／
freezeAccount／transferFunds／readTransactionHistory，不是被擋掉，是 grep 不到。
Agent A 只能讀已揭露結論、產生「建議＋原因碼」交人類覆核；Agent B 只能回布林／匯總。
**證據**：`packages/agents/test/principleOne.test.ts`（列舉禁用名單並斷言不存在）。

## 4. Policy Gate — 高風險行為如何管控？

三層閘門 L0→L1→L2：先驗「查的人有沒有資格」（授權＋vLEI 鏈），再驗「資料是否成立」
（簽章／反簽配對／撤銷／層級一致／背書可解析／身分綁定／在場證明／產線綁定；簽發者
公鑰只能來自已驗證的法人 vLEI 鏈，裸金鑰回 `ISSUER_VLEI_MISSING`），最後驗「這個問題
能不能問」（拒個體查詢、k-匿名、差分攻擊偵測、查詢預算）。**L0 失敗時勞工資料零讀取**
——結構保證，測試以 spy 佐證。順序不可顛倒：先驗料再驗人的話，未授權的 Agent 會在
被拒絕之前就已經讀到資料。
**證據**：`runAuthorizedGate` 回呼設計；`packages/agents/test/` 35 個測試檔。

## 5. Audit Log — 行動、決策與授權依據如何記錄？

每次閘門決策寫入稽核軌跡：層級、准駁、原因碼、授權依據（授權憑證雜湊＋ECR 憑證
SAID），以及**人類覆核者的職務憑證 SAID**（Agent 的建議與人的核准是兩件事，紀錄分得開）。

一份持有者能編輯的日誌不是證據，所以：**每筆承諾前一筆的雜湊**（改舊決策 → 後面全部
對不上 `CHAIN_BROKEN`；抽掉中間一筆 → `SEQUENCE_BROKEN`），**每筆以機構法人憑證公布
的金鑰封緘**（改了就 `SEAL_INVALID`，而且事後補記「某某主管批准過」也補不進去）。
`verifyAuditTrail` 設計成**給挑戰方跑的**：NGO 只釘 GLEIF root 就能從鏈根驗到每一筆決策，
不必相信持有者。誠實限制：雜湊鏈**證明不了尾端沒被截掉**，所以驗證結果會回報驗了幾筆。

對外另有可獨立驗簽的查驗收據（何時驗了哪些項目，只含項目名與憑證雜湊）；查驗日誌
反向索引使撤銷可通知所有曾驗證者。對帳的零知識版本已接上真實電路（circom ＋ Groth16），
**六項綁定檢查**確保證明綁定到這兩張憑證裡的那組數字，工時與入帳金額不在公開訊號中。
**證據**：`packages/agents/src/auditTrail.ts`、`receipt.ts`、`zkReconciliation.ts`；
`test/auditIntegrity.test.ts`、`test/reviewerAuthority.test.ts`；稽核台「治理鏈」面板。

## 6. Expiry / Revocation — 何時到期、如何撤銷？

授權預設 24 小時到期。**憑證有效期依事實的半衰期分級**：工時與入帳 90 天（且刻意同窗口，
因為兩者要互相對帳）、證件保管 180 天、契約與仲介費 3 年——判準是「這個事實可能已經改變
卻沒人重新簽發時，就該過期」。撤銷六路皆即時生效且無快取：撤單張憑證、撤勞工主體
（離境連動）、撤 Agent 授權、撤稽核機構（其背書的 T2 全面降級）、撤覆核者職務（其後不能
再核准，但在職期間簽過的仍成立）、撤 vLEI 鏈上游（GLEIF 撤 QVI 即全生態失效，TEL 事件
錨定 KEL 使偽造撤銷不可行）。demo 每一路都有按鈕可現場演示。
**證據**：`packages/agents/test/revocationPaths.test.ts`、`packages/vlei/test/chain.test.ts`；
`npm run demo:vlei` 撤銷級聯步驟。

---

**總驗證**：GitHub Actions 每次 push 跑 344 個測試＋`npm run demo:vlei`（17 步主張，
exit code 0 即全數成立）＋**瀏覽器煙霧測試**（實際載入建置站，頁面未渲染／主控台有錯／
水平溢出／觸控目標不足即失敗）；線上 demo <https://zuemen.github.io/evidence-at-source/>，
全部合成資料、無後端、私鑰不離開瀏覽器。

**我們不宣稱的事**（寫在這裡而不是等人問）：不能偵測脅迫——刀架在脖子上指紋一樣按得下去；
可信設定目前是單方 demo 等級儀式；角色憑證發給 AI Agent 與稽核機構是對 GLEIF 規範的擴充與
簡化，兩者性質不同，見 [`vlei.md`](vlei.md) 簡化清單第 6 條與 [`vlei-defense.md`](vlei-defense.md) Q4b。
