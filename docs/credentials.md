# 憑證欄位規格

四張憑證的完整欄位定義。這是欄位層級的單一事實來源——README 的摘要表、`fixtures/` 的合成資料、實作中的型別定義，全部以本文件為準。

> **本文件是憑證欄位的單一事實來源。** 與程式碼有出入時，先改這裡、確認後再改程式碼——不要在程式碼裡偷加欄位（CLAUDE.md 禁止事項第一條）。

## 欄位歸屬的三種分類

| 分類 | 定義 | SD-JWT 上的表現 |
|---|---|---|
| **公開** | 出示時必然揭露的欄位。放結論、不放原始值 | 一般 claim |
| **隱藏** | 僅在勞工明確選擇時揭露。原始數值都在這裡 | 放進 `_sd` 陣列 |
| **不入憑證** | 根本不寫進憑證。只存在勞工裝置本地，或完全不收集 | 不存在於憑證中 |

「不入憑證」這一欄是刻意設計的：**能不收的就不收**。護照號碼原文、生物特徵模板、GPS 座標一旦寫進憑證，即使加了選擇性揭露，也只是把外洩風險延後而已。

## 共通欄位（所有憑證皆有）

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
| `zeroRecruitmentFeePaid` | boolean | 公開 | **勞工支付的招募費用為零**（RBA Employer Pays） |
| `feesReimbursedByEmployer` | boolean | 公開 | 若曾支付，雇主是否已償還 |
| `reimbursedWithin90Days` | boolean | 公開 | 償還是否在就業開始後 90 天內完成 |
| `withinTaiwanLegalCap` | boolean | 公開 | 是否在台灣法定服務費上限內 |
| `standardVersion` | string | 公開 | 判準版本，例 `RBA-CoC-8.0` |
| `feeAmount` | number | 隱藏 | 實際收取金額 |
| `paymentSchedule` | string | 隱藏 | 分期方式 |
| `lenderName` | string | 隱藏 | 若為借貸支付，貸方名稱 |
| 勞工母國的原始借據影像 | — | 不入憑證 | 只存勞工裝置，必要時由勞工自行出示 |
| 勞工家庭成員資訊 | — | 不入憑證 | 不收集 |

### 為什麼這裡有兩套判準，而且不能混用

這張憑證原本只有一個公開欄位 `feeWithinLegalCap`——**依據台灣法定服務費上限**（第一年每月 1,800 元、第二年 1,700、第三年 1,500）。那是一個真實存在的法規判準，但**它不是驗證方在用的那一個**。

RBA Code of Conduct 8.0 採 **Employer Pays Principle**：

> Workers shall not be required to pay employers' agents or sub-agents' recruitment fees or other related fees for their employment.

對齊 Leadership Group for Responsible Recruitment 的表述：**沒有勞工應該為了一份工作付錢**。已支付的費用須償還勞工，**最遲不得晚於就業開始後 90 天**。

兩套標準的通過條件根本不同：

| 標準 | 判準 | 通過條件 |
|---|---|---|
| 台灣法規 | 服務費有上限 | 未超過上限即合法 |
| RBA CoC 8.0 | Employer Pays | **勞工支付金額為零** |

**一間工廠可以完全符合台灣法規，同時完全違反 RBA。** 勞工付了三萬元、金額在法定上限內、雇主未償還——台灣法規下沒有問題，RBA 下是明確違規。

而套用 RBA 準則的品牌 Agent 拿到 `feeWithinLegalCap: true`，會讀成「這家合規」。**那個答案回答的是另一個問題。** 這不是精確度不足，是答錯題。

所以判準拆開，各自標明所屬標準，並由 `standardVersion` 記錄版本。驗證方只能查詢自己授權範圍內的標準——查詢範圍外的判準回 `STANDARD_NOT_IN_SCOPE`：一個依 RBA 稽核的品牌**沒有立場**問台灣法定上限，那不是它的準則。

設計要點：驗證方需要知道的仍然是布林值。**實際金額不是任何人的業務。**

---

## 2. `DocumentCustodyCredential` — 證件保管

**簽發者**：雇主／工廠（`did:web:factory.example`）
**需勞工反簽**：是
**簽發時機**：證件交付或返還的當下

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `passportHeldByWorker` | boolean | 公開 | 護照是否由勞工本人持有。RBA 的紅線指標 |
| `custodyRequestedByWorker` | boolean | 公開 | **代管是否由勞工主動提出**。合法代管的核心要件 |
| `bilingualConsentProvided` | boolean | 公開 | 同意書是否具備雙語對照 |
| `legalBasis` | string | 公開 | 法源，例 `就業服務法 57-8` |
| `documentType` | string | 公開 | 證件類別，例 `passport`、`arc` |
| `documentHash` | string | 隱藏 | 證件影像的 SHA-256，用於比對是否為同一份 |
| `custodyLocation` | string | 隱藏 | 保管地點描述 |
| 護照號碼原文 | — | 不入憑證 | 只用 `documentHash`，不寫號碼本身 |
| 證件影像 | — | 不入憑證 | 只存勞工裝置 |
| 生物特徵模板 | — | 不入憑證 | 僅用於裝置本地解鎖，不離開裝置 |

設計要點：`passportHeldByWorker` 為 `false` **本身就是**違規訊號。**這一個布林值就足以判定，不需要看到任何一本護照。**

### 這張憑證對應的是一份已經存在的法定文件

台灣法律**已經要求**一份與這張憑證高度對應的文件。

| 法條 | 內容 | 罰則 |
|---|---|---|
| 就業服務法第 57 條第 8 款 | 雇主不得非法扣留或侵占所聘僱外國人之護照、居留證件或財物 | 6 萬～30 萬元罰鍰 |
| 護照條例第 32 條 | 非法扣留他人護照，足以生損害於公眾或他人者 | **3 年以下有期徒刑**、拘役或併科 30 萬元以下罰金 |

合法代管的核心在於**自主意願**：必須是移工**主動提出**請雇主或仲介代為保管，並簽署「證件委託保管同意書」，且該文件應具備**雙語對照**及明確項目。

對應關係一項一項對得上：

| 法律要求 | 本專案的機制 |
|---|---|
| 自主意願（勞工主動提出） | `custodyRequestedByWorker` ＋ 勞工反簽——沒有勞工簽章憑證不成立 |
| 證件委託保管同意書 | 憑證本身 |
| 雙語對照 | `bilingualConsentProvided` ＋ 錢包的母語介面 |
| 明確項目 | `documentType` |

### 三種組合，第三種是違法扣留

| `passportHeldByWorker` | `custodyRequestedByWorker` | 判讀 |
|---|---|---|
| `true` | — | 證件在本人手上，**不需要同意書** |
| `false` | `true` | 合法代管 |
| `false` | `false` | **違法扣留**——`UNLAWFUL_DOCUMENT_RETENTION` |

第三種不是「資料不足」，是一個有明確法源與刑度的違規訊號，所以它有自己的原因碼，而不是被歸進 `POLICY_CHECK_FAILED`。

**注意 `custodyRequestedByWorker` 與已移除的 `custodyConsentGiven` 的差別**：後者問「你同意嗎」，前者問「是你提出的嗎」。這不是措辭差異——「你同意嗎」在那個權力關係裡永遠會得到同意，而「是誰先開口的」比較難事後編造，也正是法律寫下的那個要件。

### 為什麼移除了 `custodyConsentGiven`

這個欄位原本的設計是「若非本人持有，是否有勞工明示同意」——也就是說，`passportHeldByWorker: false` 加上 `custodyConsentGiven: true` 會被讀成「沒有違規」。

**那正是護照扣留的漂白路徑。** 「他自己同意的」是每一個扣留護照的雇主都會講的那句話，而 ILO 強迫勞動指標把證件扣留本身列為指標，不因當事人是否「同意」而改變——因為在那個權力關係裡取得的同意，本來就不構成有效同意。

一個會把違規變成不違規的同意欄位，比沒有這個欄位更糟。它同時也是一個沒有任何檢查在讀的公開欄位——**多一個公開欄位就是多一份可外洩的資料**，沒人用的更不該留著。

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
| `withinRBALimit` | boolean | 公開 | **週工時含加班未超過上限**（RBA 60 小時／週）。語意已明確化，見下 |
| `withinRBAWeeklyLimit` | boolean | 公開 | 同上，明確命名的版本 |
| `withinLocalMonthlyLimit` | boolean | 公開 | 台灣勞基法月加班上限（46 小時／月） |
| `weeklyHoursLimit` | number | 公開 | 適用的週上限，RBA 為 60 |
| `overtimeVoluntary` | boolean | 公開 | **加班是否出於自願**。RBA 明文要求；僅能由勞工反簽表達 |
| `restDayCompliant` | boolean | 公開 | 每七日至少一日休息 |
| `standardVersion` | string | 公開 | 判準版本，例 `RBA-CoC-8.0` |
| `periodStart` | string | 公開 | 週期起日（ISO 8601 日期） |
| `totalHours` | number | 隱藏 | 本週期總工時 |
| `overtimeHours` | number | 隱藏 | 本週期加班時數 |
| `valueCommitment` | string | 公開 | `Poseidon(totalHours, overtimeHours, commitmentSalt)`。出示時一定揭露——它是零知識對帳證明的公開輸入 |
| `commitmentSalt` | string | 隱藏 | 承諾的隨機遮罩。只有勞工持有 |
| 逐日打卡紀錄 | — | 不入憑證 | 只存工廠系統與勞工裝置，憑證只放週期匯總 |
| 打卡地點 GPS | — | 不入憑證 | 不收集。位置軌跡對移工是報復風險 |

設計要點：這張憑證的欄位與 `poc/selective-disclosure.mjs` 完全一致，可直接執行驗證。跑 `npm run demo:disclosure` 會看到驗證後的 payload 中 `totalHours` 這個 key 不存在。

### 週與月是兩套不同的計算單位

RBA Code of Conduct 8.0 規定**每週不得超過 60 小時（含加班）**，緊急或異常狀況除外，並要求**每七日至少一日休息**。台灣勞基法的計算單位不同——月加班上限 46 小時。

**同一份出勤資料可能週合規而月超標，反之亦然。** 一個勞工每週 58 小時、連續四週，週週符合 RBA，月加班時數卻遠超台灣上限。所以兩個判準各自成為一個欄位，驗證方依自己適用的標準查詢，而不是拿一個布林去回答兩個問題——那正是招募費那一項犯過的錯。

### `overtimeVoluntary` 只能由勞工反簽表達

RBA 明文要求**所有加班應為自願**。這一項我們原本完全沒有。

補上它的時候有一個關鍵限制：**雇主單方聲稱「加班是自願的」沒有任何意義。** 會扣留護照的雇主，也會在自己的系統裡打勾說加班出於自願。

所以 `overtimeVoluntary` 為 `true` 的前提是**勞工反簽存在且未撤回**。沒有勞工簽章，這個欄位不得為真——不是「預設為假」，是**驗證方不接受**。這是雙簽機制除了防篡改之外的第二個正當用途：有些事實只有當事人有資格斷言。

**它仍然擋不住脅迫。** 被威脅的勞工也會簽。這一欄證明的是「有人問過他、而他簽了」，不是「他真的想加班」。與 `identity.ts` 對脅迫的立場一致：能證明的只到這裡。

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
| `valueCommitment` | string | 公開 | `Poseidon(depositedAmountTWD, commitmentSalt)`。出示時一定揭露 |
| `commitmentSalt` | string | 隱藏 | 承諾的隨機遮罩。只有勞工持有 |
| 逐筆交易明細 | — | 不入憑證 | 只存銀行系統與勞工裝置 |
| 帳號 | — | 不入憑證 | 不收集 |

設計要點：這張憑證存在的唯一理由是引入一個**工廠控制不了的資料源**。工廠控制不了銀行、銀行控制不了打卡系統，於是造假從「單方說謊」變成「兩個利益相反的機構共謀」。M7 對帳模組比對它與工時憑證：入帳金額大於申報工時應得，代表有工時沒被記錄（`DISCREPANCY_OVERPAID`）——這是「省略式造假」的指紋。對帳邏輯與結果碼見 [`packages/reconciliation`](../packages/reconciliation)。

**這張憑證證明的是「錢進去了」，不是「勞工拿到了」。** 若存摺與印章被仲介保管，錢可以入帳後隨即被領走——入帳憑證仍然為真，交叉對帳仍然平衡，而勞工實際上一毛也沒拿到。這是本專案明確的偵測邊界，寫在 [README 的系統邊界](../README.md#系統邊界這個原型還不是什麼)。

**隱私約束**：M7 的輸出只能是結果碼，永遠不得回傳 `depositedAmountTWD`、`totalHours`、`overtimeHours` 或推算出的預期薪資。此約束由 `packages/reconciliation/test/reconcile.privacy.test.ts` 守門。

---

## 6. `ResidencyCredential` — 在留身分錨定

**簽發者**：移民署（`did:web:immigration.example`）——簽發者層級 **T3 主管機關認證**
**需勞工反簽**：是
**簽發時機**：入境許可核發或換發的當下

這張憑證與前五張的作用不同：前五張證明「關於這個人的某件事」，這一張證明「**這個錢包就是這個人**」。沒有它，雙簽只能防雇主竄改紀錄，防不了仲介拿走裝置冒名開戶——那是兩個不同的攻擊者。

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `identityAnchor` | string | 公開 | 身分唯一性錨：`sha256(居留證參考 ‖ anchorSalt)`。**同一個人只會有一個錨**，但錨本身反推不出居留證號 |
| `holderDid` | string | 公開 | 這個錨綁定的錢包 DID。一錨一 DID，這就是「一人一憑證」 |
| `deviceCredentialId` | string | 公開 | 錢包註冊的裝置驗證器識別碼（FIDO／WebAuthn credential id）。簽章要通過這個裝置的生物辨識才產生得出來 |
| `permitValidUntil` | string | 公開 | 在留許可到期日（ISO 8601 日期）。過期即身分綁定失效 |
| `anchorSalt` | string | 隱藏 | 錨的遮罩。沒有它，居留證號的取值空間小到可被枚舉反推 |
| `arcReference` | string | 隱藏 | 合成的居留證參考值。**永遠是合成資料** |
| 居留證號原文 | — | 不入憑證 | 只進錨的雜湊，不寫號碼本身 |
| 生物特徵模板 | — | 不入憑證 | 留在裝置安全元件內，系統只看得到「驗證通過與否」 |
| 入出境時間軌跡 | — | 不入憑證 | 不收集。移動軌跡對移工是報復風險 |

設計要點：`identityAnchor` 是**不可轉讓性**的支點。註冊表拒絕同一個錨綁定第二個 active 的 DID——仲介替同一位勞工再開一個錢包會直接被拒（`IDENTITY_ALREADY_ENROLLED`）。裝置遺失時的正當換綁必須**先撤銷舊綁定再重綁**，於是換綁一定留下紀錄，不會安靜地發生。

---

## 7. `SelfReportedHoursCredential` — 勞工自述工時

**簽發者**：**勞工本人**（`did:key:zWorker…`，自己簽自己）
**需勞工反簽**：不適用——它本身就是勞工的簽章
**簽發時機**：勞工認為某段期間的工時未被正確記錄時，隨時可自行產生

| 欄位 | 型別 | 歸屬 | 說明 |
|---|---|---|---|
| `withinRBALimit` | boolean | 公開 | 自述工時是否在 RBA 上限內 |
| `periodStart` / `periodEnd` | string | 公開 | 自述涵蓋的期間 |
| `reportedHours` | number | 隱藏 | 勞工自述的實際時數 |
| `issuerTier` | string | 公開（envelope） | 一律 `SELF_REPORTED`，**低於任何機構層級** |

**它為什麼存在**：這個 repo 的其他每一個偵測機制，都需要雇主先寫下某樣東西。雙簽配對抓「紀錄被改」，交叉驗證抓「申報與金流不符」，Merkle 承諾抓「已產生的紀錄被漏掉」。一個控制打卡系統、照申報數字付薪、且**根本不產生那筆加班紀錄**的工廠，三者全部無效——勞工手上是空的、承諾涵蓋的是空的、帳也是平的。

這張憑證是勞工**不需要任何人同意**就能把一件事記上檔的能力。它讓「雇主從不記錄」第一次成為可觀察的事件。

**證據等級與誠實邊界**：它是單方聲明、可被偽造，因此 `issuerTier` 刻意排在 `SELF_DECLARED` 之下——驗證方要用它，必須指名要（`minimumIssuerTier: 'SELF_REPORTED'`）。**它的價值不在單筆可信，而在統計上的分歧**：一整廠的自述工時系統性高於雇主申報是一個訊號，單一勞工的自述不是證據。完整論述見 [`self-reported-hours.md`](self-reported-hours.md)。

## 為什麼這兩張憑證需要承諾欄位

零知識證明可以證明「我知道一組算得出一致的數字」——但那**不等於**「那組數字就是這張憑證裡的數字」。少了這一段，證明對任意數字都成立，也就毫無意義。

承諾欄位補上它：簽發方在簽發當下就把數值雜湊進 `valueCommitment`，電路必須證明它知道符合該承諾的原像。於是「證明的是這張憑證裡的數字」不再是要求別人相信的事。

`commitmentSalt` 必須是隱藏欄位，這一點沒有妥協空間：工時的取值範圍很小（一個月最多幾百小時），入帳金額的範圍也有限，**沒有遮罩的話任何人都能用暴力枚舉反推出承諾的原像**——那等於把隱藏欄位公開。

只有這兩張憑證帶承諾。其餘三張沒有零知識對帳的需求，讓它們也背一個承諾等於為一個用不到的功能付代價。

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
| `purpose` | string（選填） | 勞工自述反簽理由，例「為在台開戶查驗而反簽」。由勞工本人簽發、不參與配對計算，見 [`incentive-chain.md`](incentive-chain.md) |
| `deviceAssertion` | object（選填） | 裝置驗證器的在場證明，見下 |

Header：`{ alg: 'ES256', typ: 'worker-attestation+jwt' }`

### `deviceAssertion` — 本人在場，而不只是私鑰在場

私鑰簽章證明的是「持有私鑰的人同意」。**拿走裝置的仲介也持有私鑰**，所以光靠簽章回答不了「這是本人意願嗎」。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `credentialId` | string | 裝置驗證器識別碼，必須與 `ResidencyCredential.deviceCredentialId` 相同 |
| `challenge` | string | 驗證方給的一次性挑戰值，防重放 |
| `userVerified` | boolean | 驗證器是否確實做過使用者驗證（生物辨識／PIN）。**false 一律拒絕** |
| `signature` | string | 驗證器對挑戰值的簽章 |

這個結構刻意對齊 FIDO／WebAuthn 的 assertion：正式部署時 `signature` 由裝置安全元件產生、私鑰不可匯出；本專案的驗證器是**注入式**的，瀏覽器接真的 WebAuthn，測試接合成的。

**誠實界限**：這證明的是「有人通過了這台裝置的生物辨識」，**不是「這個人沒有被脅迫」**。沒有任何憑證系統能偵測脅迫——一把刀架在脖子上，指紋一樣按得下去。能做的是兩件事：把**代辦的痕跡**變成可觀測的訊號（同一台裝置替多名勞工反簽），以及把**本人事後撤銷的成本降到趨近於零**。兩者都已實作，但都不該被說成是脅迫偵測。

驗證方的配對檢查邏輯：`attestation.subjectCredentialHash === sha256(presentedCredential)`。不成立則回 `ATTESTATION_HASH_MISMATCH`。實作參考 `poc/dual-signature.mjs`。

---

## 有效期：一張憑證該活多久（題06 Q5）

「合規憑證應該有多長的有效期」沒有單一答案，因為這些憑證記的事實**半衰期不一樣**。一個薪資週期會結束，一份契約不會。全部給同一個有效期，結果不是契約憑證太早過期，就是讓去年的加班時數回答今年的稽核——而**後者沒有人會發現**。

判準只有一條：**當這個事實可能已經改變、卻沒有人重新簽發時，憑證就該過期。**

| 憑證 | 有效期 | 理由 |
|---|---:|---|
| `WorkingHoursCredential` | 90 天 | 週期性事實，新一期應該取代舊一期。一季足夠稽核回溯，又短到讓過期工時無法回答當期問題 |
| `SalaryDepositCredential` | 90 天 | 與工時同窗口——這兩張是拿來互相對帳的，週期不一致就對不起來 |
| `DocumentCustodyCredential` | 180 天 | 護照一移動，保管狀態就變了。半年對上 RBA 稽核實際的節奏，並強制期間重新聲明一次 |
| `RecruitmentFeeCredential` | 3 年 | 一次性事件，但它的意義存續整個契約期。移工契約典型為三年 |
| `ContractConsentCredential` | 3 年 | 同上 |
| `ResidencyCredential` | 1 年 | 但真正的上限是許可本身：閘門另外檢查 `permitValidUntil`（`RESIDENCY_PERMIT_EXPIRED`），**兩者取先到的那個** |

實作在 `CREDENTIAL_LIFETIME_SECONDS`（[`packages/issuer/src/issuer.ts`](../packages/issuer/src/issuer.ts)），個別簽發者仍可覆寫。**追溯撤銷不受有效期影響**：工廠被發現違規時，先前核發的憑證由撤銷登記立即失效，並由查驗日誌的反向索引產生「該通知誰」的名單——有效期管的是「自然老化」，撤銷管的是「事後發現它本來就不該成立」，兩者不能互相取代。

## 欄位新增規則

**不得自行擴充憑證欄位。** 要新增：

1. 先問「驗證方真的需要這個欄位才能做決定嗎？」多數情況答案是不需要——他們需要的是一個由這個欄位推導出的布林值
2. 若確實需要，優先放「隱藏」，只有結論才放「公開」
3. 先改本文件，再改程式碼
4. 同步更新 README 的摘要表

每多一個欄位，就多一份可外洩的資料。
