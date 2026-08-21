# vLEI 信任層規格

機構信任不再來自手動維護的公鑰名單（舊 `knownInstitutions`），而是來自 GLEIF vLEI
生態系的憑證鏈。勞工面的四張 SD-JWT 憑證與選擇性揭露機制**完全不變**（原則二）；
vLEI 只回答兩個問題：**這家機構是誰**（Legal Entity vLEI）、**這個 Agent 憑什麼**
（Engagement Context Role vLEI）。

## 信任鏈

```mermaid
flowchart LR
    GLEIF["GLEIF Root AID<br/>（trust anchor）"] -->|QVI vLEI Credential| QVI["QVI<br/>Qualified vLEI Issuer"]
    QVI -->|Legal Entity vLEI<br/>LEI・legalName・didWeb・credentialSigningJwk| LE["法人機構<br/>銀行／品牌／工廠／仲介"]
    LE -->|ECR vLEI<br/>agentDid・engagementContextRole| AGENT["AI 查驗 Agent"]
```

- 每個節點是一個 KERI AID（自我定址識別碼），金鑰輪替寫入 KEL 並帶 pre-rotation 承諾。
- 每張憑證是 ACDC（v/d/i/ri/s/a/e/r），SAID 自我定址，撤銷狀態在簽發方的 TEL。
- 驗鏈時每一跳都重驗：SAID、簽章（經 KEL 解出簽發時金鑰）、TEL 狀態、schema SAID、
  LEI 檢查碼（ISO 17442 mod 97-10）與上下游 LEI 一致性。**上游撤銷即全鏈失效**：
  QVI 憑證被撤，所有 LE 與 ECR 立刻驗不過。

## 與 SD-JWT 世界的橋接

- LE vLEI 的 `credentialSigningJwk` 是機構簽 SD-JWT（勞工憑證與 DelegationCredential）
  的 ES256 公鑰。驗證方**只能**從已驗證的 LE 鏈取得這把鑰匙——沒有其他信任來源。
- L0 要求 Agent 同時出示 DelegationCredential（SD-JWT）與 ECR 鏈（ACDC），並比對
  `claims.agentDid === ecr.agentDid`、`claims.principal === le.didWeb`，不一致回
  `AGENT_VLEI_BINDING_MISMATCH`。
- L1 的 issuer 公鑰由 `resolveIssuerSigningKey`（agents/vleiBridge）從 LE 鏈解出，
  鏈壞回 `ISSUER_VLEI_CHAIN_INVALID`、被撤回 `ISSUER_VLEI_REVOKED`。

## Schema profiles

credentialType 沿用官方名稱（QualifiedvLEIIssuervLEICredential、
LegalEntityvLEICredential、LegalEntityOfficialOrganizationalRolevLEICredential、
LegalEntityEngagementContextRolevLEICredential）。擴充欄位：

| Schema | 官方欄位 | PoC 擴充欄位 | 擴充理由 |
|---|---|---|---|
| QVI | LEI | — | — |
| Legal Entity | LEI, legalName | didWeb, credentialSigningJwk, issuerTier | 綁定機構的 SD-JWT 簽章身分；`issuerTier` 由 QVI 寫入，機構改不了（題06 Q1） |
| OOR | LEI, personLegalName, officialRole | — | **已接線**：銀行覆核主管持有，稽核軌跡記其 SAID（題06 Q4） |
| ECR | LEI, engagementContextRole | agentDid | 兩種角色：`ai-verification-agent`（查驗 Agent）與 `third-party-auditor`（稽核機構背書） |

rules 區塊逐字收錄官方 usageDisclaimer 與 issuanceDisclaimer。

## 明文簡化與已補實項（PoC）

1. ~~單簽 KEL~~ → **已支援 kt 門檻多簽**（GLEIF root 為 2-of-3）；witness 與 delegated AID 仍未實作。
2. ~~KEL/TEL 以 in-process store 共享~~ → **可攜出示包**：出示以單一 JSON（credentials + KELs + TELs）傳遞，
   驗證方僅需帶外釘選 root AID，匯入時全部重驗；CESR stream framing 仍未實作。
3. Schema SAID 為本 repo 自算，非 GLEIF 登錄之官方 SAID（接軌路徑見 defense Q2）。
   **注意這與 SAID 演算法無關**：演算法本身已與參考沙盒逐位元組比對相符（見下節），
   這一項講的是 schema 內容不是官方登錄的那一份。
4. ~~偷到舊金鑰可偽簽舊 seq~~ → **TEL 事件已錨定控制者 KEL**：每個 vcp/iss/rev 先以現行金鑰
   在 KEL 寫入 seal（ixn）再簽發；偽簽者無法用舊金鑰延長 KEL 補錨，未錨定事件 fail-closed。
5. 所有 LEI 由 `syntheticLei()` 產生（tag + X 填充 + 合法檢查碼），明顯為合成值。
6. **角色憑證的持有者被擴充到自然人以外**，這是本 PoC 與 GLEIF 規範最明顯的一處偏離，
   必須主動說明而不是等人問：官方 OOR 與 ECR 都是**發給自然人**的。本 repo 有兩處擴充——
   ECR 發給 **AI Agent 的 DID**（`agentDid` 擴充欄位，是整個專案的前提：Agent 要有可撤銷的
   授權身分），以及 ECR 發給**稽核機構這個法人**以表示「第三方稽核者」資格。
   後者在正式 vLEI 裡更貼近的做法，是由該稽核機構的**自然人**持 OOR／ECR 代表機構背書，
   或以法人對法人的 ACDC 鏈結（edge）表示背書關係，而不是把角色憑證發給組織 DID。
   **對驗證邏輯沒有影響**（鏈驗證、撤銷級聯、角色比對都相同），但對「我們是否照規範建模」
   這個問題，誠實的答案是：**Agent 那一處是刻意且必要的擴充，稽核機構那一處是簡化。**

## 互通性狀態：與參考沙盒的 SAID 計算一致

原本這裡寫的是 SAID 計算「未經官方測試向量驗證」——那是懂 KERI 的人第一個會問的問題，而自己算的雜湊自己驗永遠會通過，所以那句話一直沒有答案。

現在有了。對照對象是 [`smpebble/vlei-sandbox`](https://github.com/smpebble/vlei-sandbox)（MIT 授權、純 Python 的 KERI／CESR／ACDC 參考實作）。

**結論：相符。** 三組向量的 SAID 與 `@eas/vlei` 逐字元相同，記錄在 [`fixtures/vlei-sandbox-said-vectors.json`](../fixtures/vlei-sandbox-said-vectors.json)，由 [`sandboxInterop.test.ts`](../packages/vlei/test/sandboxInterop.test.ts) 固定住。

比對方式值得寫清楚，因為它決定了這個結論的份量：**先確認兩邊產生的預映像位元組完全相同，再比雜湊。** 欄位順序、無空白分隔、`ensure_ascii=False` 對應 JS `JSON.stringify` 的非 ASCII 不跳脫、`#` × 44 的 placeholder、版本字串的兩趟計算——這些若有任何一項不同，雜湊相同只會是巧合。三組向量分別覆蓋：帶 edge 區塊的 ACDC、`d` 與 `i` 同值的 KERI inception、以及混合巢狀物件／整數／CJK 的 payload。

**一個實測過程中的插曲值得記下來**：沙盒預設在沒有安裝 `blake3` 套件時，會靜默退回 Blake2b-256（CESR code `F`），而我們用的是 Blake3-256（code `E`）。第一次跑出來的 SAID 前綴不同，看起來像實作不一致，實際上是**相依套件缺席**而非規格分歧。裝上 `blake3` 之後兩邊都是 code `E`，逐位元組相同。

**這個結論的精確範圍**：一致的對象是**參考沙盒**，而沙盒本身也是模擬。這不構成「與 KERIA 互通」的宣稱，也沒有測到 CESR stream framing、witness、delegated AID。它證明的是：SAID 這一層的計算方式，與一個獨立實作在位元組層級同意。

沙盒是驗證工具，**不是執行期相依**——向量記錄下來之後，測試不需要 Python。

## I2I 運算子：已實作，只是沒用規格的名字

**I2I（Issuer-to-Issuee）**：一張憑證的核發者，必須就是它所指向的那張授權憑證的收受者。這是 vLEI 假冒不成立的核心——權限是「指向」的，不是「宣稱」的。

`@eas/vlei` **每一跳都有這個檢查**，失敗碼是 `CHAIN_ISSUER_MISMATCH`：

| 位置 | 檢查 |
|---|---|
| `verifyLeChain` | 法人憑證的核發者 ＝ QVI 憑證的收受者 |
| `verifyEcrChain` | ECR 的核發者 ＝ 法人憑證的收受者 |
| `verifyOorChain` | OOR 的核發者 ＝ 法人憑證的收受者 |

[`i2iOperator.test.ts`](../packages/vlei/test/i2iOperator.test.ts) 跑了工作坊講的那個攻擊（B 盜用 A 的授權），並且刻意證明一件容易被誤解的事：**攻擊裡每一張憑證的簽章都是真的。** 攻擊者的 KEL 是真的、TEL 是真的、他簽的 ECR 單獨驗證會通過（測試裡直接對 `verifyAcdc` 斷言 `ok === true`），他指向的那張法人憑證也確實是 QVI 簽的、未撤銷。逐張驗證每一張都成立，整條鏈仍然被拒絕——**擋下它的是方向性，不是簽章。**

## ECR 的核發路徑：法人自簽，不缺 AUTH 憑證

依林淦鈞簡報 P12，ECR 有兩條合法路徑：法人自行核發，或委由 QVI 核發。後者需要 AUTH 憑證，前者不需要。

**本 repo 走的是法人自簽。** `grantAgentEcr` 委派到 `entity.grantEcr`，而該處 `issueAcdc({ issuer: entity, ... })`——核發者就是法人自己的 AID，收受者是它自己的 Agent。驗證端 `verifyEcrChain` 要求 `ecr.acdc.i === le.facts.aid`，也就是同一條路徑的 I2I。

**所以這裡沒有缺口，不需要補 AUTH 憑證。** 這一點值得明白寫下來，因為「鏈看起來少一張憑證」很容易被誤讀成簡化——它是兩條合法路徑中的一條，而不是漏做的那一條。為了讓鏈看起來完整而補一個架構不需要的憑證型別，只會增加一個沒有語意的環節。

## 原因碼

L0：AGENT_VLEI_MISSING／AGENT_VLEI_CHAIN_INVALID／AGENT_VLEI_REVOKED／
AGENT_VLEI_BINDING_MISMATCH。L1：ISSUER_VLEI_CHAIN_INVALID／ISSUER_VLEI_REVOKED。
細粒度失因（SAID_MISMATCH 等 `VleiFailure`）只存在 `@eas/vlei` 內部，出閘門一律
折疊成上述原因碼，不夾帶任何欄位值。
