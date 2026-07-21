# CLAUDE.md — Evidence at Source 施工守則

這份文件寫給在這個 repo 上工作的 Claude Code。**動任何一行程式碼之前先讀完。**

專案定位：讓「關於勞工的事實」由勞工本人持有，並在事件發生當下就簽章封存，使銀行與品牌的 AI Agent 只能問到答案、拿不到資料。

---

## 三條不可違反的原則

這三條沒有例外、沒有「這次先這樣之後再改」。違反其中任何一條，這個專案的論點就不成立了。

### 原則一：權限寫在工具清單，不寫在 prompt

**Agent 不該擁有的能力，對應的函式不得存在於程式碼中。**

以下函式**禁止實作**（任何語言、任何模組、任何命名變體）：

- `approveAccount`
- `rejectAccount`
- `freezeAccount`
- `transferFunds`
- `readTransactionHistory`
- 任何回傳個別勞工清單或明細的查詢

**不要寫出來再用 if 擋掉。不要寫出來再 throw。不要寫出來再註解掉。根本不要寫。**

理由：靠 prompt 約束 Agent 行為是不可靠的，靠條件判斷擋是可繞過的。唯一可驗證的邊界是「這個能力在程式碼裡不存在」。**評審會看程式碼。** 他們會 grep 這些函式名，找到任何一個——即使被擋掉了——論點就破了。

Agent A 代表銀行，它能做的只有：讀取已揭露的憑證欄位、依政策計算出一個建議、把建議與原因碼交給人類覆核。**它不能執行任何帳戶動作。**

Agent B 代表品牌，它能做的只有：回答「這批供應商在這個週期是否合規」這類布林或匯總問題。**它不能取得任何一位勞工的個別紀錄。**

### 原則二：只回答，不交付資料

**驗證方拿到的永遠是布林值或匯總值。**

原始欄位——實際工時、實際仲介費金額、實際薪資數字——**必須用 SD-JWT 的選擇性揭露機制隱藏**，放進 `_sd` 陣列，不得以任何形式出現在 presentation 的 payload 中。

判定方式很簡單：驗證方 `verify()` 之後拿到的 payload，`'totalHours' in payload` 必須是 `false`。**不是值為 null、不是被遮蔽成 `***`、不是被前端過濾——是這個 key 密碼學上不在裡面。**

可以揭露的是結論（`withinRBALimit: true`），不是產生結論的原始數字。

實作前先跑一次 `poc/selective-disclosure.mjs`，那就是這條原則的可執行定義。

### 原則三：禁用真實敏感資料

**全部使用合成資料，放在 `fixtures/`。這是主辦方的硬性規定。**

不得使用任何真實移工的姓名、護照號碼、居留證號、電話、地址、帳號、生物特徵。不得從任何真實資料集抽樣。不得「拿真的改幾個字」。

合成資料一律放 `fixtures/`，不散落在各模組的程式碼裡。姓名用明顯虛構的形式，DID 用 `did:key:zWorker001` 這類明顯是範例的值，機構用 `did:web:factory.example` / `did:web:agency.example`。

---

## 命名慣例

**憑證型別**：PascalCase，以 `Credential` 結尾。

```
✅ WorkingHoursCredential
✅ RecruitmentFeeCredential
✅ DocumentCustodyCredential
✅ ContractConsentCredential
❌ workingHours
❌ WorkingHoursVC
❌ Working_Hours_Credential
```

**失敗原因碼**：SCREAMING_SNAKE_CASE。

```
✅ INDIVIDUAL_QUERY_REJECTED
✅ ATTESTATION_HASH_MISMATCH
✅ CREDENTIAL_REVOKED
❌ individualQueryRejected
❌ ERR_1042
```

原因碼必須語意自明——讀到就知道為什麼被拒，不需要查表。

**目前已定義的原因碼**（新增前先確認是否已有涵蓋的）：

| 原因碼 | 層 |
|---|---|
| `INVALID_ISSUER_SIGNATURE` | L1 |
| `MISSING_WORKER_ATTESTATION` | L1 |
| `ATTESTATION_HASH_MISMATCH` | L1 |
| `CREDENTIAL_REVOKED` | L1 |
| `CREDENTIAL_EXPIRED` | L1 |
| `CLAIM_NOT_DISCLOSED` | L1 |
| `INDIVIDUAL_QUERY_REJECTED` | L2 |
| `AGGREGATE_BELOW_K_ANONYMITY` | L2 |

---

## 禁止事項

**不得自行擴充憑證欄位。**
四張憑證的欄位定義在 `docs/credentials.md`。實作時發現少了欄位——**先改文件、確認過再改程式碼**，不要在程式碼裡偷加一個欄位然後說之後補文件。每多一個欄位就多一份可外洩的資料。

**不得加入繞過 Policy Gate 的測試後門。**
沒有 `SKIP_POLICY_GATE`、沒有 `NODE_ENV === 'test'` 就放行、沒有 `bypassGate` 參數、沒有 debug flag 直接回傳完整 payload。測試要驗證閘門，就得走完整流程。一個後門就是一個評審會問「那你們的保證到底是什麼」的破口。

**不得在錯誤訊息裡洩漏被隱藏的欄位值。**
拒絕時回原因碼，不要在 message 裡附上「實際工時為 186 小時，超過上限」。

**不得把私鑰寫進 repo。** `.gitignore` 已含 `*.pem` `*.key` `.env`。生成的金鑰只存在於執行期記憶體或使用者裝置。

**不得改動 `poc/` 下兩支腳本的邏輯。** 它們是報名的關鍵證據，已實測跑通，輸出被 README 引用。要做新實驗就新開檔案。

---

## 開發優先順序

**先讓這兩個測試情境可跑，其他都往後排：**

1. **T4 — 篡改偵測**：雇主事後修改已簽發的憑證資料，驗證方比對勞工反簽的 `subjectCredentialHash` 後判定不成立，回 `ATTESTATION_HASH_MISMATCH`。
2. **T3 — 拒絕個體查詢**：Agent B 送出指向個別勞工的查詢，L2 提問層拒絕，回 `INDIVIDUAL_QUERY_REJECTED`，且回應中不含任何個別勞工識別資訊。

理由：這兩個情境分別對應「工廠無法單方造假」與「品牌拿不到員工明細」，是整個專案的兩根支柱。**其餘功能再完整，這兩個跑不起來就沒有故事。**

T1–T7 的完整定義見 `docs/BUILD-SPEC-開發規格書.md`。實作排程：

| 階段 | 範圍 | 完成標準 |
|---|---|---|
| W1 | M1 shared、M2 issuer | T2、T4 可跑 |
| W2 | M2 撤銷、M4 wallet | 連動撤銷生效；PendingAttest 與 PresentQR 頁可用 |
| W3 | M3 agents | T3、T5 可跑（特別注意原則一） |
| 8/29 | M5 console 的 SplitDemo、RevokeDemo，串接全模組 | T1–T7 全部可跑 |

每階段結束跑一次對應測試情境，再進下一階段。**不要一次做完多個階段。**

---

## 環境備註

- **Node 22 以上。** PoC 已在 Node 22 與 Node 25 實測通過。
- **`@sd-jwt/crypto-nodejs` 的版本是 `^0.19.0`，不是 0.20.x。** 該套件沒有發布 0.20 版；`@sd-jwt/sd-jwt-vc` 才是 `^0.20.0`。兩者版本號不一致是正常的，不要「順手對齊」成同一個版本，會裝不起來。

---

## 語言慣例

- 文件、README、Markdown 內文：**繁體中文**
- 程式碼註解、變數名、函式名、commit message：**英文**

---

## 自我檢查

提交任何一批程式碼之前，跑一遍：

```bash
# Principle 1: forbidden functions must not exist anywhere in the code
grep -rn -E "approveAccount|rejectAccount|freezeAccount|transferFunds|readTransactionHistory" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" . | grep -v node_modules

# Expected: no output

# Principle 3: no strings shaped like real ARC numbers
grep -rn -E "[A-Z]{2}[0-9]{8}" --include="*.ts" --include="*.json" fixtures/ src/ 2>/dev/null

# Expected: if there is output, confirm each hit is a synthetic value
```

無輸出才能提交。
