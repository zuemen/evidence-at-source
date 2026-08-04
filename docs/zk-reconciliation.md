# 錢包端 ZK 對帳（Phase 4）

## 為什麼要這一層

階段一的 M7 交叉驗證有一個弱點：**它是唯一同時看得到兩張憑證明文的元件**，等於一個可信第三方。評審會問「誰保證你的對帳伺服器不洩漏那些數字」。

ZK 消除這個節點。唯一合法同時持有工時憑證與薪資憑證的是**勞工本人**，所以證明應在**錢包端**產生：勞工在自己的裝置上證明「我的工時與入帳在容差內一致」，驗證方只收到一個布林結論與一個證明，從頭到尾看不到任何數字。

## 電路設計 `PayrollConsistency`

| 類型 | 訊號 | 說明 |
|---|---|---|
| private | `totalHours`、`overtimeHours`、`depositedAmount` | 勞工的原始數字，永不離開裝置 |
| public | `legalWageRate`、`overtimeMultiplier`、`toleranceBps` | 對帳參數 |
| public | `hoursCredentialHash`、`salaryCredentialHash` | **綁定用**：這個證明是關於哪兩張憑證 |
| output | `consistent` | 私有數字是否落在容差內 |

約束（與 [`packages/reconciliation`](../packages/reconciliation) 的 `reconcile` 同一套邏輯）：

```
normalHours   = totalHours - overtimeHours
expectedPay   = normalHours * legalWageRate + overtimeHours * legalWageRate * overtimeMultiplier
tolerance     = expectedPay * toleranceBps / 10000
consistent    = (depositedAmount >= expectedPay - tolerance) AND (depositedAmount <= expectedPay + tolerance)
```

## 憑證綁定（最容易漏掉、也最關鍵）

一個對任意數字產生的證明是**沒有意義的**——勞工可以拿隨便的數字產生一個「一致」的證明。所以驗證方必須同時確認四件事，缺一不可：

1. **proof 有效**（密碼學驗證）。
2. `hoursCredentialHash` 對應**一張有效、未撤銷、未過期**的工時憑證。
3. `salaryCredentialHash` 對應**一張有效、未撤銷、未過期**的薪資憑證。
4. 兩張憑證的 `workerDID` **相同**。

這四項在 [`packages/agents/src/zkReconciliation.ts`](../packages/agents/src/zkReconciliation.ts) 的 `verifyReconciliationProof` 中**已完整實作並各有測試**（見 `zkReconciliation.test.ts`）。第 2、3 項透過既有的 L1 憑證層（`checkCredentialLayer`）驗證憑證真偽與撤銷／有效期；第 2、3 項再比對 presentation 的雜湊等於 public signal（綁定）；第 4 項比對兩張憑證的 workerDID。

## M7 的角色轉變

在 ZK 版本裡，M7 **不再接觸明文**。它的職責變成：提供公開參數、驗證證明 + 綁定、匿名匯總。`verifyReconciliationProof` 就是這個新 M7 的核心——它從不讀取 `totalHours` 或 `depositedAmount`，只驗證證明與綁定，然後回一個布林。

## 降級狀態（誠實說明）

**本環境沒有 circom / Rust 工具鏈**（`circom`、`cargo`、`rustc` 皆不存在），因此**真實的 ZK 電路尚未接上**。依開發規格 §S4 的降級路徑（「工具鏈裝不起來即停手，保留伺服器端 M7；跑不通不拖累其他模組」），本階段交付的是：

- ✅ **憑證綁定的四項檢查**：完整實作、各有測試（這是「省略即失去意義」的關鍵部分）。
- ✅ **M7 角色轉變的介面**：`verifyReconciliationProof` 從不接觸明文。
- ✅ **電路設計文件**（本檔）。
- ⛔ **真實電路的編譯／產證**：降級未做（工具鏈不可用）。證明數學置於注入的 `verifyProof` 之後；預設的 `stubProofVerifier` **一律拒絕**，因此缺少後端永遠不會被誤判為有效證明。
- ✅ **可運行的對帳仍在**：伺服器端的 M7（[`packages/reconciliation`](../packages/reconciliation)）照常運作，demo 畫面不變。差別僅在於「我們的伺服器從未看過任何一個數字」這句話目前尚不能說。

### 要接上真實電路

1. 安裝 circom + snarkjs，用上表的訊號與約束撰寫 `PayrollConsistency.circom`，編譯出 `.wasm` 與 `.zkey`。
2. 錢包端用 snarkjs 以私有數字 + 公開參數產證。
3. 提供一個由 snarkjs verifier 支撐的 `verifyProof` 傳入 `verifyReconciliationProof`——**其餘綁定邏輯一行都不用改**。
