# 憑證欄位規格

四張憑證的完整欄位定義。這是欄位層級的單一事實來源——README 的摘要表、`fixtures/` 的合成資料、實作中的型別定義，全部以本文件為準。

> **本表為骨架階段定義。** `docs/BUILD-SPEC-開發規格書.md` 入庫後，若其 §2 與本文件有出入，以 BUILD-SPEC 為準，並回頭修正本文件。

## 欄位歸屬的三種分類

| 分類 | 定義 | SD-JWT 上的表現 |
|---|---|---|
| **公開** | 出示時必然揭露的欄位。放結論、不放原始值 | 一般 claim |
| **隱藏** | 僅在勞工明確選擇時揭露。原始數值都在這裡 | 放進 `_sd` 陣列 |
| **不入憑證** | 根本不寫進憑證。只存在勞工裝置本地，或完全不收集 | 不存在於憑證中 |

「不入憑證」這一欄是刻意設計的：**能不收的就不收**。護照號碼原文、生物特徵模板、GPS 座標一旦寫進憑證，即使加了選擇性揭露，也只是把外洩風險延後而已。

## 共通欄位（四張憑證皆有）

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `iss` | string | 公開 | 簽發者 DID，例 `did:web:factory.example` |
| `iat` | number | 公開 | 簽發時間（Unix 秒）。這就是「證據前置」的時間錨 |
| `vct` | string | 公開 | 憑證型別，PascalCase + `Credential` 結尾 |
| `workerDID` | string | 公開 | 勞工 DID，例 `did:key:zWorker001` |
| `exp` | number | 公開 | 到期時間（Unix 秒） |

`workerDID` 是化名識別碼，不含任何可直接指向自然人的資訊。真實身分的對應關係只存在勞工裝置本地。

---

## 1. `RecruitmentFeeCredential` — 仲介費

**簽發者**：仲介公司（`did:web:agency.example`）
**需勞工反簽**：是
**簽發時機**：每一筆費用收取的當下

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `feeWithinLegalCap` | boolean | 公開 | 本筆費用是否在法定上限內。**這是驗證方唯一需要的答案** |
| `currency` | string | 公開 | 幣別，例 `TWD` |
| `contractPeriod` | string | 公開 | 契約期間，例 `2026-08-01/2029-07-31` |
| `feeAmount` | number | 隱藏 | 實際收取金額 |
| `paymentSchedule` | string | 隱藏 | 分期方式 |
| `lenderName` | string | 隱藏 | 若為借貸支付，貸方名稱 |
| 勞工母國的原始借據影像 | — | 不入憑證 | 只存勞工裝置，必要時由勞工自行出示 |
| 勞工家庭成員資訊 | — | 不入憑證 | 不收集 |

設計要點：銀行的 Agent A 需要知道的是「這位申請人是否背著超過法定上限的仲介債務」——那是 `feeWithinLegalCap`，一個布林值。**實際金額不是它的業務。**

---

## 2. `DocumentCustodyCredential` — 證件保管

**簽發者**：雇主／工廠（`did:web:factory.example`）
**需勞工反簽**：是
**簽發時機**：證件交付或返還的當下

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `passportHeldByWorker` | boolean | 公開 | 護照是否由勞工本人持有。RBA 的紅線指標 |
| `custodyConsentGiven` | boolean | 公開 | 若非本人持有，是否有勞工明示同意 |
| `documentType` | string | 公開 | 證件類別，例 `passport`、`arc` |
| `documentHash` | string | 隱藏 | 證件影像的 SHA-256，用於比對是否為同一份 |
| `custodyLocation` | string | 隱藏 | 保管地點描述 |
| 護照號碼原文 | — | 不入憑證 | 只用 `documentHash`，不寫號碼本身 |
| 證件影像 | — | 不入憑證 | 只存勞工裝置 |
| 生物特徵模板 | — | 不入憑證 | 僅用於裝置本地解鎖，不離開裝置 |

設計要點：`passportHeldByWorker` 為 `false` 且 `custodyConsentGiven` 為 `false`，是 RBA 稽核的直接違規訊號。**這兩個布林值就足以判定，不需要看到任何一本護照。**

---

## 3. `ContractConsentCredential` — 契約同意

**簽發者**：仲介公司（`did:web:agency.example`）
**需勞工反簽**：是
**簽發時機**：契約簽署的當下

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `nativeLanguageVersionProvided` | boolean | 公開 | 是否提供勞工母語版本。知情同意的前提 |
| `language` | string | 公開 | 母語版本的語言代碼，例 `id`、`vi`、`th`、`tl` |
| `consentTimestamp` | string | 公開 | 同意時間（ISO 8601） |
| `salaryAmount` | number | 隱藏 | 契約約定薪資 |
| `contractDocumentHash` | string | 隱藏 | 契約全文 SHA-256 |
| 契約全文 | — | 不入憑證 | 只存勞工裝置，憑證只放雜湊 |
| 勞工簽名影像 | — | 不入憑證 | 以密碼學簽章取代，不需要影像 |

設計要點：`nativeLanguageVersionProvided` 為 `false` 意味著這份同意在知情同意的意義上是有瑕疵的——**這件事本身就是稽核結論，不需要讀契約內容。**

---

## 4. `WorkingHoursCredential` — 工時

**簽發者**：工廠打卡系統（`did:web:factory.example`）
**需勞工反簽**：是
**簽發時機**：每個薪資週期結算的當下

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `withinRBALimit` | boolean | 公開 | 本週期工時是否在 RBA 上限內 |
| `periodStart` | string | 公開 | 週期起日（ISO 8601 日期） |
| `totalHours` | number | 隱藏 | 本週期總工時 |
| `overtimeHours` | number | 隱藏 | 本週期加班時數 |
| 逐日打卡紀錄 | — | 不入憑證 | 只存工廠系統與勞工裝置，憑證只放週期匯總 |
| 打卡地點 GPS | — | 不入憑證 | 不收集。位置軌跡對移工是報復風險 |

設計要點：這張憑證的欄位與 `poc/selective-disclosure.mjs` 完全一致，可直接執行驗證。跑 `npm run demo:disclosure` 會看到驗證後的 payload 中 `totalHours` 這個 key 不存在。

---

## 5. `SalaryDepositCredential` — 薪資入帳

**簽發者**：銀行或小額匯兌業者（例 `did:web:bank.example`）——**其 issuer DID 必須與工廠不同**
**需勞工反簽**：是
**簽發時機**：每個薪資週期入帳的當下

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `periodStart` | string | 公開 | 對應薪資期間起日 |
| `periodEnd` | string | 公開 | 對應薪資期間迄日 |
| `issuerType` | string | 公開 | `BANK` 或 `REMITTANCE` |
| `depositedAmountTWD` | number | 隱藏 | 該期實際入帳金額 |
| `depositCount` | number | 隱藏 | 該期入帳筆數 |
| 逐筆交易明細 | — | 不入憑證 | 只存銀行系統與勞工裝置 |
| 帳號 | — | 不入憑證 | 不收集 |

設計要點：這張憑證存在的唯一理由是引入一個**工廠控制不了的資料源**。工廠控制不了銀行、銀行控制不了打卡系統，於是造假從「單方說謊」變成「兩個利益相反的機構共謀」。M7 對帳模組比對它與工時憑證：入帳金額大於申報工時應得，代表有工時沒被記錄（`DISCREPANCY_OVERPAID`）——這是「省略式造假」的指紋。對帳邏輯與結果碼見 [`packages/reconciliation`](../packages/reconciliation)。

**隱私約束**：M7 的輸出只能是結果碼，永遠不得回傳 `depositedAmountTWD`、`totalHours`、`overtimeHours` 或推算出的預期薪資。此約束由 `packages/reconciliation/test/reconcile.privacy.test.ts` 守門。

---

## 勞工反簽 Attestation

四張憑證共用同一種反簽結構。這不是憑證，是一張獨立的 JWT，由勞工私鑰簽發。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `iss` | string | 勞工 DID |
| `subjectCredentialHash` | string | 被反簽憑證的 SHA-256（base64url） |
| `workerDID` | string | 勞工 DID（與 `iss` 相同，冗餘保留供比對） |
| `attestedAt` | string | 反簽時間（ISO 8601） |
| `deviceFingerprint` | string | 裝置指紋雜湊，用於偵測異常簽署裝置 |

Header：`{ alg: 'ES256', typ: 'worker-attestation+jwt' }`

驗證方的配對檢查邏輯：`attestation.subjectCredentialHash === sha256(presentedCredential)`。不成立則回 `ATTESTATION_HASH_MISMATCH`。實作參考 `poc/dual-signature.mjs`。

---

## 欄位新增規則

**不得自行擴充憑證欄位。** 要新增：

1. 先問「驗證方真的需要這個欄位才能做決定嗎？」多數情況答案是不需要——他們需要的是一個由這個欄位推導出的布林值
2. 若確實需要，優先放「隱藏」，只有結論才放「公開」
3. 先改本文件，再改程式碼
4. 同步更新 README 的摘要表

每多一個欄位，就多一份可外洩的資料。
