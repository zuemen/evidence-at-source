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

**證據**：`packages/vlei/test/`（全套測試，含多簽、錨定、可攜出示包）；`npm run demo:vlei`。

### Q2. 你們的 schema SAID 不是 GLEIF 官方登錄的，互通性呢？

正確，$id 是我們對自己的 schema profile 算出的 SAID（演算法與官方相同：
Blake3-256 over saidified serialization）。credentialType 沿用官方名稱四張全套
（QualifiedvLEIIssuervLEICredential 等），欄位對齊官方語意，擴充欄位逐一列表
並說明理由。接軌路徑：把 profile 換成官方 schema JSON、$id 換官方 SAID，驗證
碼一行不用改——schema 識別本來就是用 SAID 比對的。

**證據**：`packages/vlei/src/schemas.ts`；`packages/vlei/test/schemas.test.ts`。

### Q3. 金鑰輪替後，偷到舊金鑰的人可以偽簽舊序號的憑證嗎？

已封死。每個 TEL 事件（vcp/iss/rev）在簽發前都由**現行金鑰**在控制者 KEL 寫入
seal（ixn 互動事件）；驗證方對每個 TEL 事件都要求錨存在。偷到舊金鑰的人可以
偽造事件本體與舊 seq 簽章，但無法在不持有現行金鑰的情況下延長 KEL 補錨——
未錨定事件一律 fail-closed 為 unknown。加上 pre-rotation（下一把金鑰的承諾寫在
前一個事件裡），現行金鑰與歷史兩個方向都由 KEL 封鎖。

**證據**：`packages/vlei/test/tel.test.ts`（a validly-signed but unanchored event
fails closed）；`packages/vlei/test/kel.test.ts`（anchoring 與 pre-rotation 系列）。

### Q4. LE credential 塞 `credentialSigningJwk`、ECR 塞 `agentDid`，這不是偏離標準嗎？

是擴充，且是有意的：這兩個欄位是 KERI 世界（機構身分）與 SD-JWT 世界（勞工
憑證與 Agent 授權書）之間**唯一的橋**。機構簽 SD-JWT 的 ES256 公鑰只能從已驗證
的 LE 鏈取得，沒有第二個信任來源——這正是「改成 vLEI」的意義：刪掉手動維護的
公鑰名單。官方生態系日後若定義等價的 key-binding credential，替換點只有
`agents/vleiBridge.ts` 一個檔案。

**證據**：`packages/agents/test/vleiBridge.test.ts`；`packages/agents/src/delegationGate.ts`
（搜 `knownInstitutions`——已不存在）。

### Q4b. 官方 OOR／ECR 是發給自然人的，你們卻發給 AI Agent 和稽核機構？

問得對，這是本專案與規範最明顯的一處差距，我們寫在 `docs/vlei.md` 簡化清單第 6 條，
不等人問。兩處要分開看，因為性質不同：

**發給 AI Agent（`agentDid`）是刻意且必要的擴充。** 整個題目就是「Agent 代表機構去
觀察別人」，那 Agent 就必須有一個可驗證、**可被機構單方撤銷**的授權身分。ECR 的語意
（engagement context role，特定情境下的角色）本來就最接近這件事；官方生態系目前沒有
「機構授權給非自然人代理」的憑證型別，這是規範還沒追上 AI Agent 的地方，不是我們
繞過它。

**發給稽核機構（`third-party-auditor`）是簡化，我們承認。** 更貼近規範的做法是：由該
稽核機構的**自然人**持 OOR 代表機構簽署背書，或用法人對法人的 ACDC edge 表示背書
關係。我們把角色憑證直接發給組織 DID，是為了在黑客松時間內讓「撤銷稽核機構 → 它
背書過的 T2 全部降級」這條級聯可被當場演示。

**對驗證邏輯零影響**：鏈驗證、撤銷級聯、角色比對三者的程式碼路徑完全相同，改成
自然人持證只是換掉 subject 與多一層 edge。要改的檔案是
`packages/agents/src/auditorDirectory.ts` 一個。

**證據**：`packages/agents/test/auditorChain.test.ts`（含「角色不可互換」一項——
持 agent ECR 的機構不能充當稽核者）；`docs/vlei.md` 簡化清單第 6 條。

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

**證據**：`npx vitest run packages/vlei`（全套測試數秒內完成，含數百次全鏈重放）。

### Q10. 為什麼評審要相信這不是「看起來像 vLEI 的自製品」？

三個檢查點：(1) 資料格式逐項對規格——CESR 前綴碼、KERI version string 兩段式
sizing、icp/rot/vcp/iss/rev 事件欄位、ACDC v/d/i/ri/s/a/e/r 區塊、官方 rules
條文逐字收錄；(2) 差異全部明文列出（docs/vlei.md 明文簡化五條 + 擴充欄位表），
沒有一項是藏著的；(3) 全部主張可執行——`npm run demo:vlei` 一條命令，
exit code 就是答案。

**證據**：`docs/vlei.md`；`packages/vlei/src/`（每檔案頭部註解標明對應規格與簡化）。
