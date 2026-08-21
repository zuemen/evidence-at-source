# Dual-Signature Pairing — 規格

| | |
|---|---|
| **版本** | 0.1.0 |
| **日期** | 2026-08-21 |
| **狀態** | Draft |
| **授權** | CC BY 4.0（見 [`LICENSE`](LICENSE)） |
| **參考實作** | [`packages/shared/src/attestation.ts`](../packages/shared/src/attestation.ts) |
| **測試向量** | [`vectors/`](vectors/) |

本文件的關鍵詞 **MUST**、**MUST NOT**、**SHOULD**、**MAY** 依 RFC 2119 解釋。

---

## 1. 這份規格為什麼存在

企業層級的憑證有規範（GLEIF vLEI），持有人繫結有規範（W3C VC），選擇性揭露有規範（SD-JWT VC）。

**沒有人規範過「利益相反的雙方共同簽章同一筆事件」。**

雇主記錄工時，勞工反簽確認。兩方的利益相反——這正是這個機制有意義的原因，也是它不能沿用單方持有人繫結的原因。持有人繫結回答「出示這張憑證的人是不是它的持有人」；這份規格回答的是另一個問題：**「這筆紀錄的兩造是不是都同意它？」**

## 2. 名詞

| 名詞 | 定義 |
|---|---|
| **Issuer** | 產生原始紀錄的一方（雇主、仲介、銀行、主管機關） |
| **Subject** | 紀錄所描述的自然人。在本 profile 中同時是 Holder |
| **Issuer Credential** | Issuer 簽發並簽章的憑證 |
| **Worker Attestation** | Subject 對某一張 Issuer Credential 的反簽 |
| **Pair** | 一組（Issuer Credential, Worker Attestation） |
| **Verifier** | 檢查一組 Pair 的第三方 |

## 3. 資料模型

### 3.1 Issuer Credential

本 profile 採 **SD-JWT VC**（[draft-ietf-oauth-sd-jwt-vc](https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/)，實作對應 `@sd-jwt/sd-jwt-vc` 0.20.x）。

**哪些是本機制的必要條件，哪些只是本 profile 的選擇——這一點必須分清楚**：

| 性質 | 必要性 | 說明 |
|---|---|---|
| 憑證可序列化為一個穩定的位元組串 | **必要** | 沒有穩定序列化就沒有可雜湊的對象 |
| 該序列化中存在一個**不隨出示而改變**的區段 | **必要** | 見第 4 節。這是整個機制的支點 |
| 該區段**密碼學上涵蓋所有欄位**（含隱藏欄位） | **必要** | 否則篡改隱藏欄位不會被偵測 |
| 使用 SD-JWT VC | 本 profile 的選擇 | 任何滿足上述三項的格式皆可 |
| 使用 ES256 | 本 profile 的選擇 | 見第 8 節的演算法敏捷性 |

`workerDID` 欄位 **MUST** 存在於 Issuer Credential 中，且 **MUST** 是公開欄位（不得放入 `_sd`）——驗證方必須在不依賴任何揭露的情況下讀得到它，否則第 6 節的步驟 5 無法執行。

### 3.2 Worker Attestation

一個 JWS Compact Serialization 的 JWT。

**Protected Header**

| 欄位 | 型別 | 必要 | 值 |
|---|---|---|---|
| `alg` | string | **MUST** | `ES256`（本 profile） |
| `typ` | string | **MUST** | `worker-attestation+jwt` |

**Payload**

| 欄位 | 型別 | 必要 | 語意 |
|---|---|---|---|
| `subjectCredentialHash` | string | **MUST** | 依第 4 節計算的雜湊 |
| `workerDID` | string | **MUST** | 反簽者宣稱的自身識別碼 |
| `iss` | string | **MUST** | 同 `workerDID` |
| `attestedAt` | string | **MUST** | ISO 8601 時戳，反簽當下 |
| `deviceFingerprint` | string | **MUST** | 反簽裝置的識別值 |
| `purpose` | string | MAY | 反簽者自述的目的。**不參與配對** |
| `deviceAssertion` | object | MAY | 裝置驗證使用者的斷言。**不參與配對** |

`purpose` 與 `deviceAssertion` 標為不參與配對是刻意的：它們是**其他機制**的輸入（誘因鏈與臨場證明），而配對的判準必須只有一個。

Worker Attestation **MUST NOT** 包含任何來自 Issuer Credential 的隱藏欄位值。

## 4. 雜湊範圍（本規格的核心）

### 4.1 規範性定義

設 `S` 為 Issuer Credential 的序列化字串。

```
issuerSignedSegment := S 中第一個 "~" 之前的所有字元
                       （若 S 不含 "~"，則為 S 全部）

subjectCredentialHash := BASE64URL( SHA-256( UTF8( issuerSignedSegment ) ) )
```

Base64url **MUST** 為無填充（no padding）。

**驗證方 MUST 以完全相同的方式計算，包括在收到的是一份已選擇性揭露的出示（presentation）時。** 出示與原始憑證的 `issuerSignedSegment` 相同，這正是本設計成立的原因。

### 4.2 為什麼不涵蓋整串

**若雜湊涵蓋整串 SD-JWT，機制會壞掉。** 持有人每次選擇性揭露都會丟掉不同的 disclosure，產生不同的字串，因此每一次誠實的揭露都會讓配對失敗。結果是勞工必須全部揭露才能證明配對——這與整個專案的前提直接矛盾。

**只涵蓋 issuer-signed 區段仍然抓得到篡改**，因為隱藏欄位的 `_sd` digest 就在那個區段裡。Issuer 改動任何一個隱藏欄位的值，對應的 digest 必然改變，issuer-signed 區段隨之改變，雜湊隨之改變，配對隨之失敗。

**這一節是這份規格存在的理由。** 它是一個不寫下來、兩個實作就必然互不相容的決定：一個實作雜湊整串、另一個雜湊區段，兩者對誠實的選擇性揭露會給出相反的結論。向量 `dsp-005` 是唯一能證明這個設計正確的測試。

### 4.3 實作者常犯的錯

| 錯誤 | 後果 |
|---|---|
| 雜湊整串 SD-JWT | 每次選擇性揭露後配對失敗 |
| 雜湊解碼後的 payload | 不同 JSON 序列化產生不同雜湊；且不涵蓋簽章 |
| 用有填充的 base64 | 字串比對失敗 |
| 用 base64 而非 base64url | 同上 |
| 先正規化 JSON 再雜湊 | 不必要，且引入正規化分歧 |

## 5. 產生程序

Subject 產生反簽時 **MUST**：

1. 取得完整的 Issuer Credential `S`。
2. 依第 4 節計算 `subjectCredentialHash`。
3. 組出第 3.2 節的 payload，`iss` 與 `workerDID` **MUST** 相同。
4. 以 Subject 的私鑰簽章，header 依第 3.2 節。

Subject **SHOULD** 在簽章前檢視憑證的可揭露內容。**反簽的意義是確認，不是收訖。**

## 6. 驗證程序

Verifier **MUST** 依序執行下列步驟。任一步失敗即終止並回報該步的原因碼；**MUST NOT** 繼續執行後續步驟。

| 步驟 | 檢查 | 失敗時的原因碼 |
|---|---|---|
| 1 | Issuer Credential 的簽章以 Issuer 的公鑰驗證通過 | `INVALID_ISSUER_SIGNATURE` |
| 2 | Issuer Credential 未過期（`exp`） | `CREDENTIAL_EXPIRED` |
| 3 | Worker Attestation 存在，`typ` 為 `worker-attestation+jwt`，且簽章以 Subject 的公鑰驗證通過 | `MISSING_WORKER_ATTESTATION` |
| 4 | `subjectCredentialHash` 等於依第 4 節對本次收到的憑證／出示重算的值 | `ATTESTATION_HASH_MISMATCH` |
| 5 | Worker Attestation 的 `workerDID` 等於 Issuer Credential 的 `workerDID` | `ATTESTATION_SUBJECT_MISMATCH` |
| 6 | 憑證未被撤銷（若 Verifier 有撤銷來源） | `CREDENTIAL_REVOKED` |

**步驟 5 不得省略。** 步驟 1–4 只證明「**某個**持鑰人簽了**這張**憑證」。若 Verifier 從 Attestation 的 `iss` 解出公鑰——這是很自然的實作方式——則缺少步驟 5 時，勞工 A 可以替勞工 B 的憑證反簽而配對成立，且**過程中每一個簽章都是真的**。

> **實作紀錄**：參考實作原本就缺這一步。它是在把行為寫成本規格、逐條列出檢查時被發現的。見 `packages/agents/test/pairingSubjectBinding.test.ts`。

**步驟 3 的原因碼刻意合併。** 「沒有反簽」與「反簽驗不過」對 Verifier 是同一件事：**都沒有得到當事人的確認**。分開回報會告訴攻擊者他的偽造距離成功有多近。

### 6.1 撤銷來源缺席的處理

Verifier 若沒有撤銷來源，**MUST** 將步驟 6 視為**未檢查**，而非通過。此區別 **SHOULD** 出現在驗證結果中。沒有撤銷來源的驗證方，不能宣稱憑證未被撤銷。

## 7. 這個機制不防禦什麼

**一份只寫做到什麼的規格是不可信的。** 以下每一項都是本機制**明確不涵蓋**的。

### 7.1 脅迫下的簽署

**被威脅的勞工也會簽。** 指紋不會因為刀架在脖子上就失效，反簽也一樣。

本機制能證明的是「某人持有該金鑰並簽了名」，**不是「他自願」**。任何宣稱雙簽能證明自願的說法都是錯的。

緩解只能是間接的：匿名的脅迫訊號（見 `docs/coercion-signals.md`）可以讓大量集中在同一時間、同一裝置的反簽變得可見，但那是統計層級的訊號，**救不了個案**。

### 7.2 雙方共謀

雇主與勞工若都同意造假，兩個簽章都是真的，配對完全成立。

本機制把「單方說謊」提高成「兩方共謀」。**這是成本的提高，不是不可能。** 在雇主握有續聘、宿舍與居留身分的關係裡，這個成本可能比看起來低得多。

### 7.3 根本不產生紀錄

**這是本機制最大的盲點。** 一個從不記錄某筆加班的雇主，不需要偽造任何東西——沒有憑證，就沒有配對可以失敗。勞工手上是空的。

本規格對此**完全無效**。需要另外的機制（紀錄集合承諾、勞工自述、跨來源對帳），且那些機制不在本規格範圍內。

### 7.4 金鑰竊取與冒充

若第三方取得 Subject 的私鑰（沒收手機、脅迫解鎖、惡意軟體），該第三方可產生完全有效的反簽。

本機制**不含**任何活體或臨場檢測。臨場性是另一個機制的責任（本 profile 以 device assertion 處理，見 `deviceAssertion` 欄位），且它同樣擋不住脅迫。

### 7.5 時間戳可信度

`attestedAt` 由 Subject 自行填寫，**沒有任何可信時間來源**。它 **MUST NOT** 被當作可信時戳使用。需要可信時間的應用 **SHOULD** 使用外部時戳服務或鏈上錨定。

### 7.6 重放

一份 Worker Attestation 是**可無限重複出示**的，這是刻意的：它證明的是一個歷史事實（此人確認過此紀錄），而歷史事實不會因為被講第二次就變假。

因此 Attestation **本身不含 nonce，也不應該含**。若應用需要「此人**此刻**在場」的保證，那是**另一個**要求，**MUST** 以獨立的 challenge-response 滿足（例如 `deviceAssertion` 中的 `challenge`），**MUST NOT** 靠在配對裡塞 nonce 達成——那會讓每次出示都需要重新反簽，而勞工可能已經離境。

同一份 Attestation 出示給多個 Verifier 會產生**可連結性**：兩個 Verifier 比對後可知是同一人。本 profile **不解決**這個問題。

## 8. 演算法敏捷性

本 profile 固定 SHA-256 與 ES256。

`subjectCredentialHash` **不含演算法識別碼**，這是一個已知的限制：日後若需更換雜湊演算法，舊反簽無法自我描述。

未來版本 **SHOULD** 改用多重雜湊形式（例如前綴 `sha256:`），並在過渡期內同時接受兩種形式。**本版本尚未如此，寫下來以免將來有人以為那是疏漏。**

更換演算法**不會**使既有反簽失效——它們仍可用原演算法驗證——但驗證方必須知道該用哪一個，而 v0.1.0 的答案只能是「SHA-256，因為規格這樣寫」。

## 9. 與既有標準的關係

| 標準 | 我們採用什麼 | 我們新增什麼 | 相容性狀態 |
|---|---|---|---|
| **SD-JWT VC** | 憑證格式、選擇性揭露機制 | — | 採用 `@sd-jwt/sd-jwt-vc` 0.20.x。**未對 draft 做正式相容性測試** |
| **W3C VC Data Model 2.0** | 概念上的 Issuer／Subject／Holder 角色 | — | **不對位。** 本 profile 未產生 W3C VCDM 形式的憑證，也未做對映測試 |
| **ACDC / KERI** | 機構信任層另以 `@eas/vlei` 實作 | — | 與本配對規格**無直接關係**。SAID 計算已與參考沙盒逐位元組比對相符，但**不宣稱與 keripy／KERIA 互通** |
| **W3C VC Holder Binding** | 概念 | **雙方配對規則** | 持有人繫結證明「出示者即持有者」；本規格證明「兩造皆同意此紀錄」。**這是不同的命題** |
| **本 profile** | — | 第 4 節的雜湊範圍、第 6 節的驗證序列 | 這是本規格唯一的新增部分 |

**未經驗證的相容性一律標示為未驗證。** 上表中任何寫著「未」的項目，都不應被引用為相容性主張。

## 10. 測試向量

[`vectors/`](vectors/) 含一組靜態向量，涵蓋通過與各類失敗情境。

任何實作 **SHOULD** 通過全部向量。向量為靜態合成值，可直接用於外部實作的一致性檢查，且 **MUST NOT** 用於任何真實場景——其中的私鑰是公開的。

驗證向量不需要本 repo 的執行期程式碼：

```bash
npm run verify:external
```

該指令使用 [`packages/verifier`](../packages/verifier)，一個零 `@eas/*` 相依的獨立驗證器。

## 11. 版本與變更

本文件為 **0.1.0**。

已知的未來工作，列在這裡以免被誤認為疏漏：

| 項目 | 狀態 |
|---|---|
| 雜湊演算法識別碼（多重雜湊） | 未做，見第 8 節 |
| 規格的版本治理（誰能改、破壞性變更如何標示） | 未定義 |
| 多實作互通測試 | **需要第二個獨立實作才能進行**，目前不存在 |
| 出示協定（OpenID4VP 等） | 不在本規格範圍 |

**「有第二個實作」是這份規格從草稿變成規格的真正條件。** 在那之前，這份文件與這組向量是一份邀請，不是一個既成事實。
