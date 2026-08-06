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

## 實作狀態

**電路已接上**（circom 2.2.3 ＋ Groth16 ＋ snarkjs）。本階段交付的是：

- ✅ **憑證綁定的四項檢查**：完整實作、各有測試（有效／未撤銷／同一勞工／雜湊相符）。
- ✅ **數值層級的綁定**：Poseidon 承諾。簽發方在簽發當下把數值雜湊進憑證的
  `valueCommitment`，電路必須證明它知道符合該承諾的原像。**沒有這一層，證明對任意
  數字都成立**——四項檢查驗的是「這張憑證是真的」，承諾驗的是「證的是這張憑證裡的數字」。
- ✅ **M7 角色轉變**：`verifyReconciliationProof` 從不接觸明文。
- ✅ **真實電路的編譯／產證／驗證**：見 [`../circuits/`](../circuits/)。
- ✅ **與 `reconcile()` 的等價性**：五個邊界情境逐一比對，見
  [`../packages/agents/test/zkCircuit.test.ts`](../packages/agents/test/zkCircuit.test.ts)。

### 電路訊號

| 類別 | 訊號 |
|---|---|
| 私有 | `totalHours`、`overtimeHours`、`hoursSalt`、`deposit`、`salarySalt` |
| 公開輸入 | `hoursCommitment`、`salaryCommitment`、`legalWageRate`、`overtimeMultiplierBps`、`toleranceBps` |
| 公開輸出 | `verdict`（0 一致／1 少付／2 溢付） |

### 兩個必須知道的實作限制

**不做除法。** `reconcile()` 用浮點數乘 1.34，電路只能算整數。兩者若各自捨入，
邊界值上會給出不同結論——同一份證據兩條路徑不同答案，比沒有電路更糟。電路因此
改用放大整數，比較式兩邊同乘，全程不做除法。

**只有二次約束。** circom 不接受三個 signal 相乘，薪資計算拆成中間 signal。

### fail-closed 仍然成立

`stubProofVerifier`（一律拒絕）**仍是預設值**。真實驗證器 `createGroth16Verifier`
必須由呼叫端明確傳入並附上驗證金鑰——缺少後端絕不能看起來像通過。

### 仍然誠實標註的界限

可信設定是**本機單方產生的 demo 等級儀式**。正式部署需要多方參與的儀式；單方 setup
若保留 toxic waste 就能偽造證明。詳見 [`../circuits/README.md`](../circuits/README.md)。

### 上線前要怎麼補：三條路，都不必改電路

「需要多方儀式」如果沒有下一句，就只是一句免責聲明。實際上有三條成熟的路，
**共同點是電路本身一行都不用動**——要換的只是產生證明金鑰的方式：

| 路徑 | 做法 | 代價 |
|---|---|---|
| **接既有的 powers of tau** | 直接用 Perpetual Powers of Tau 這類已由數百人接力的公開 ceremony 產物，只自己做電路專屬的 phase 2 貢獻 | 最省事，但 phase 2 仍是我方單方，仍須開放外部貢獻 |
| **開放多方貢獻的 phase 2** | 把 zkey contribution 開放給評審、NGO、品牌、銀行各貢獻一次，全程可公開驗證 | 需要協調參與者；**只要有一位誠實參與者不洩漏亂數，setup 就是安全的** |
| **換成 universal setup** | 改用 PLONK／Halo2 這類不需要電路專屬 ceremony 的證明系統 | 換證明系統的工程成本；證明較大、驗證較慢 |

以本專案的信任模型來說，**第二條最合適**：這個系統的整套論述就是「不要相信任何單一方」，
可信設定當然不該是唯一的例外。而參與者名單其實已經現成——vLEI 鏈上的每一個法人，
本來就是彼此不信任又都在鏈上的角色。

**在那之前，我們不主張這個 setup 可以信任到上線。** 現在成立的主張只有一個：
伺服器不再看得到那些數字。

