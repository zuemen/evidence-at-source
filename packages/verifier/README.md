# @eas/verifier

**驗證不應依賴我們的授權選擇，也不應依賴我們還在不在。**

這個套件對 `@eas/*` **零相依**。它從 [`spec/dual-signature-pairing.md`](../../spec/dual-signature-pairing.md) 重新實作，不共用參考實作的任何一行程式碼——因此兩者一致代表規格說清楚了，兩者不一致代表**規格有缺陷**，而不只是其中一邊有 bug。

授權：**Apache-2.0，永久**。

## 為什麼要有這個東西

repo 裡其他所有驗證跑的都是我們自己的程式碼。一個嚴格的評審可以正確地說：**「你的程式碼說你的程式碼是對的。」**

這個套件是跳出那個迴圈的方式。

## 用法

```bash
# 跑整組公開向量——別人檢查自己實作的入口
node packages/verifier/cli.js vectors spec/vectors

# 或
npm run verify:external
```

```bash
# 驗一組雙簽配對
node packages/verifier/cli.js pairing <credential> <attestation> <issuer-jwk> <worker-jwk>

# 驗一張查驗收據
node packages/verifier/cli.js receipt <receipt> <verifier-jwk>
```

每個參數可以是**檔案路徑或值本身**。

## 它不能做什麼

**它不能簽發任何東西。** 沒有 `SignJWT`、沒有金鑰產生、沒有匯出私鑰的能力——有一個守門測試會掃描這個目錄並在任何簽章能力出現時轉紅（[`verifierIndependence.test.ts`](../shared/test/verifierIndependence.test.ts)）。

一個能簽發的驗證器，信任面就等同於它本來要從外部稽核的那個系統。

## 相依

| 套件 | 為什麼 |
|---|---|
| `jose` | JWT／JWS 驗證。標準函式庫，不是我們的 |
| `@noble/hashes` | SHA-256 |

守門測試同時檢查這份清單沒有變長。

## 這個驗證器目前的限制

| 未涵蓋 | 原因 |
|---|---|
| 撤銷狀態 | 需要 Verifier 自己的撤銷來源，不是一個離線驗證器能知道的事 |
| vLEI 信任鏈 | 屬機構信任層，不在本規格範圍 |
| 裝置臨場性 | 另一個機制，見規格 7.4 |

**它驗的是規格寫下來的東西，不是整個系統。** 這個區別要講清楚，否則「通過獨立驗證」會被讀成比實際更強的主張。
