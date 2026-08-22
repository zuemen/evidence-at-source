# GLEIF 三支柱自我對照：Mandate・Workload・Transaction

GLEIF 在 2026 年 8 月的《Trustworthy AI agents》提出一個設計樣式：**一個 agent 只有在身分、證據、政策三者收斂時才行動**，並把控制面拆成三根支柱——委任（Mandate）、工作負載（Workload）、交易（Transaction）。

這份文件逐項對照本專案做到哪裡、哪裡是空的。**空的那一欄比滿的那兩欄重要**：一份只列出自己做到什麼的對照表，讀者無法判斷沒列到的是「不需要」還是「沒做」。

GLEIF 的核心命題本專案完全同意，並且已經是程式碼裡的結構：

> **hard gates first; confidence only routes review** ——
> 密碼學、簽發權、身分一致、委任範圍任何一項不過就直接擋；信心分數只決定「送誰複核」，永遠不能推翻前者。

在本專案裡這條規則是型別層的事實而不是慣例：閘門回傳的是 `{ ok: false, reason: ReasonCode }`，沒有任何路徑讓一個分數把它翻成 `ok: true`。系統裡也沒有任何 LLM 參與判定——`packages/explain` 只把已經定案的原因碼轉成人話，且產生的文句若與判定矛盾就整段丟棄（`EXPLANATION_REJECTED`），改用樣板。

---

## 支柱一：Mandate — 誰可以代表誰行動

GLEIF 要求一份可用的委任綁定：主體法人與授權角色、受託工作負載、允許的操作與交易類別、金額與對象上限、有效期與撤銷、nonce 與政策版本、以及供事後重演的證據引用。

| GLEIF 要求 | 本專案 | 位置 |
|---|---|---|
| 主體法人與授權角色 | vLEI 信任鏈 GLEIF→QVI→LE→ECR；agent 的權限來自 ECR 角色憑證，L0 每次查詢重驗全鏈 | `packages/vlei`、`packages/agents/src/delegationGate.ts` |
| 允許的操作與交易類別 | 委任憑證列舉 `allowedQueryTypes` 與憑證型別；超出即 `QUERY_TYPE_NOT_IN_SCOPE`／`CREDENTIAL_TYPE_NOT_IN_SCOPE` | `packages/shared/src/delegation.ts` |
| 上限與適用範圍 | 場域綁定（GS1 `facilityId`，不符即 `CREDENTIAL_FACILITY_MISMATCH`）、合規標準範圍（`STANDARD_NOT_IN_SCOPE`）、查詢預算（`QUERY_BUDGET_EXCEEDED`） | `policyGate.ts` |
| 有效期與撤銷 | 六條撤銷路徑即時生效、**完全不快取**；憑證有效期分級 | `revocationPaths.ts`、`docs/credentials.md` |
| nonce 與重放保護 | 每次提問的 nonce 與重放窗口（`QUERY_REPLAY_DETECTED`）；為何掛在提問而非委任見文件 | `docs/replay-protection.md` |
| 政策版本 | `POLICY_VERSION` 寫進每一筆稽核紀錄，可回溯當時參數重演 | `policyVersion.ts` |
| 受託工作負載身分 | **未做**——見支柱二 | — |

**超出 GLEIF 樣式的一項**：本專案的 agent 不只受限於委任，而是**能力本身不存在**。`approveAccount`、`transferFunds`、任何回傳個別勞工明細的查詢，在整個 repo 裡沒有實作。委任限制的是「被授權做什麼」，這一條限制的是「做得到什麼」——評審可以 grep 驗證（`CLAUDE.md` 附自檢指令）。

---

## 支柱二：Workload — 現在打進來的是哪一個軟體

GLEIF 列了五層：建置來源（build provenance）、官方發行簽章、獨立安全評估、部署證明（approved image + runtime state）、以及這次呼叫所用的工作負載身分（SPIFFE ID）。

**五層做到兩層。** 逐層的理由已寫在 README 的〈Workload 支柱：五層做到兩層〉，此處只做摘要，細節與可自行執行的驗證指令以 README 為準：

| GLEIF 層 | 本專案 |
|---|---|
| 建置來源 | **做到**——CI 對 `packages/web/dist/` 產生 Sigstore 簽署的 build provenance attestation，綁定特定 commit 與 workflow run |
| 官方發行簽章 | **做到**——同一份 attestation 即是發行簽章；`gh attestation verify` 任何人可自驗 |
| 獨立安全評估 | **未做**——需要第三方，自己評自己正是本專案在憑證層反對的事（`SELF_DECLARED` 不得宣稱成 `THIRD_PARTY_VERIFIED`） |
| 部署證明 | **原理上不適用**——瀏覽器不會也無法向任何人證明它載入了什麼 |
| 工作負載身分（SPIFFE） | **原理上不適用**——靜態站沒有長期執行的工作負載可以持有身分 |

**這是三根支柱裡最弱的一根，而弱的形式有兩種，不該混為一談**：安全評估是「沒有資源做」，後兩層是「這個部署形態不適用」。硬做一個 SPIFFE ID 出來只會是一個字串常數——那不是證據，是布景。

**它為什麼仍然重要**：GLEIF 的論點是三根支柱必須收斂到同一個法人。本專案能證明「這個 ECR 角色屬於這家銀行」，也能證明「這份前端出自這個 commit」，但不能證明「現在提問的這個執行實例就是那家銀行部署的那一份」。一個被入侵的部署會帶著完全合法的委任來提問，而閘門會放行。

**最短的補法**（若要往服務端走）：已有的 provenance attestation 是起點——把 attestation digest 綁進 agent 的委任憑證，驗證方在 L0 比對「提問者宣告的部署 digest ∈ 這個法人簽署過的發行清單」。這需要一個真的服務邊界，因此排在賽後。

---

## 支柱三：Transaction — 現在的事實夠不夠支持這個動作

GLEIF 的範例是一張發票要付款前必須成立的五項主張，每一項都要有權威證據與判定測試，且「沒有任何單一簽章能證明整筆交易」。

本專案的對應是「這位勞工的憑證能不能支持一個開戶／合規判定」：

| GLEIF 的判定測試 | 本專案的對應 |
|---|---|
| 簽章有效、簽發方屬於合約對手 | 簽發方金鑰必須來自已驗證的 LE vLEI 鏈（`ISSUER_VLEI_CHAIN_INVALID`），且宣告的可信層級不得高於鏈上授予（`ISSUER_TIER_MISMATCH`） |
| 金額可重算 | ZK 對帳：電路重算並輸出結論，六項綁定確保「電路打開的承諾＝憑證裡的承諾」（`PROOF_COMMITMENT_MISMATCH`）、「回報的結論＝電路輸出」（`PROOF_VERDICT_MISMATCH`） |
| 貨物已被獨立一方簽收 | 雙簽：事實由簽發方與**勞工本人**共同簽章；單方事後重製對不上 `subjectCredentialHash`（`ATTESTATION_HASH_MISMATCH`） |
| 受款人與法人一致 | 反簽者必須就是憑證的主體（`ATTESTATION_SUBJECT_MISMATCH`）；錢包必須綁在移民署身分錨上（`WORKER_IDENTITY_UNBOUND`、`IDENTITY_ALREADY_ENROLLED`） |
| 尚未被重複支付 | 提問層的重放偵測與差分攻擊偵測（`QUERY_REPLAY_DETECTED`、`DIFFERENCING_ATTACK_DETECTED`） |
| 決策留下可重演的收據 | 雜湊鏈＋ES256 封緘的稽核軌跡，挑戰方可獨立重驗；**加上外部檢查點**，見下 |

### 收據的一個誠實補強

GLEIF 的樣式要求「執行閘道行動並簽署收據」。本專案原本只做到一半：稽核軌跡能證明中間沒有被改，但證明不了**尾端沒有被剪掉**——一個較短的前綴驗起來一樣完美。

`packages/agents/src/auditAnchor.ts` 補上這一段：週期性把軌跡的頭部摘要（`seq` + `headDigest`）發布到持有者改不動的地方，之後任何比檢查點短、或在同一位置摘要不符的軌跡，就不只是「未驗證」而是**被反證**（`TAIL_TRUNCATED`／`ANCHOR_MISMATCH`）。

它同樣有誠實的邊界，且寫在程式碼的註解與回傳值裡：

- 保護不到**最後一次檢查點之後**的那段——所以 `checkpointGap` 是回傳值的一部分，而不是被藏起來的實作細節。檢查點的頻率就是這個洞的大小。
- `createLocalAnchorLog` **不提供任何獨立性**（同一個程序同時持有軌跡與檢查點），命名刻意帶 `Local` 就是為了不讓人誤認。真正的錨定是部署要填的接縫（`AnchorPublisher`）：對手方收據、主管機關信箱、或公開鏈上的一筆交易。
- 本 repo **不含任何錨定金鑰或鏈上客戶端**——repo 裡的金鑰就是外洩的金鑰。

---

## 一句話總結

| 支柱 | 狀態 |
|---|---|
| Mandate | 做到，且在一處超出樣式（能力不存在，不只是未授權） |
| Workload | **五層做到兩層**：一層缺資源，兩層在靜態站上原理不適用 |
| Transaction | 做到，收據新增外部檢查點以覆蓋尾端截斷，並標明未覆蓋的窗口 |

GLEIF 說三根支柱必須收斂到同一個法人才可行動。本專案能完整收斂其中兩根，第三根只覆蓋到「這份程式碼出自哪個 commit」，覆蓋不到「現在提問的是不是那份部署」——這個缺口寫在這裡而不是留給讀者自己發現——因為一個宣稱三根都有的系統，和一個列出自己缺哪一根的系統，可信度是相反的。
