# 一致性測試向量

**用途**：讓任何人檢查自己的實作是否與 [`../dual-signature-pairing.md`](../dual-signature-pairing.md) 相容。

## ⚠️ 這些是公開的測試金鑰

`keys.json` 內含**私鑰**。它們是刻意公開的合成值，存在的唯一目的是讓向量可被重現。

**絕不可用於任何真實場景。** 任何以這些金鑰簽發的東西，地球上每一個人都能偽造。

向量中的識別碼（`did:key:zSpecWorker001`、`did:web:spec-factory.example`）同樣是明顯虛構的值。

## 向量格式

每個向量自足——輸入、預期輸出、以及為什麼要有這一個：

```json
{
  "id": "dsp-001",
  "description": "誠實流程：配對成立",
  "rationale": "為什麼這個向量存在",
  "input": {
    "issuerCredential": "<完整字串>",
    "workerAttestation": "<完整字串>",
    "issuerPublicJwk": { },
    "workerPublicJwk": { }
  },
  "expected": { "pairingValid": true, "reasonCode": null }
}
```

`expected.credentialExpired` 只在相關時出現（`dsp-006`）。

## 涵蓋的情境

| 向量 | 情境 | 預期 |
|---|---|---|
| `dsp-001` | 誠實流程 | 配對成立 |
| `dsp-002` | 簽發者事後篡改 | `ATTESTATION_HASH_MISMATCH` |
| `dsp-003` | 缺少反簽 | `MISSING_WORKER_ATTESTATION` |
| `dsp-004` | 勞工簽章無效 | `MISSING_WORKER_ATTESTATION` |
| **`dsp-005`** | **選擇性揭露後配對仍成立** | **配對成立** |
| `dsp-006` | 憑證已過期 | 配對成立，但 `credentialExpired` |
| `dsp-007` | 反簽指向另一張憑證 | `ATTESTATION_HASH_MISMATCH` |
| `dsp-008` | 他人替當事人反簽 | `ATTESTATION_SUBJECT_MISMATCH` |
| `dsp-009` | 型別錯誤的 JWT 冒充反簽 | `MISSING_WORKER_ATTESTATION` |

### `dsp-005` 是這組向量的重點

它是唯一能區分兩種雜湊範圍的測試。

一個雜湊**整串 SD-JWT** 的實作，在 `dsp-001` 會通過、在 `dsp-005` 會失敗——而 `dsp-005` 正是真實使用中最常見的情況（勞工只揭露結論）。**沒有這個向量，兩個互不相容的實作都會覺得自己是對的。**

### `dsp-006` 為什麼 `pairingValid` 是 `true`

過期與配對是規格第 6 節裡的**不同步驟**。一張過期憑證的反簽仍然成立——當事人確實確認過那份紀錄，而那個歷史事實不會因為憑證到期就變假。過期是 Verifier 另外要處理的事，所以向量分開表達。

把兩者混成一個布林，會讓實作者無從分辨自己是哪一項不合。

## 怎麼跑

**用本 repo 的獨立驗證器**（零 `@eas/*` 相依）：

```bash
npm run verify:external
```

**用你自己的實作**：讀取每個 `dsp-*.json`，依規格第 6 節執行驗證，比對 `expected`。

## 這組向量沒有涵蓋什麼

| 未涵蓋 | 原因 |
|---|---|
| 撤銷（步驟 6） | 撤銷狀態來自 Verifier 自己的來源，無法靜態編碼進向量 |
| 裝置臨場性 | 屬另一個機制，見規格 7.4 |
| 演算法協商 | v0.1.0 固定 ES256 與 SHA-256，見規格第 8 節 |
| 多實作互通 | **需要第二個獨立實作才能進行，目前不存在** |

最後一項是這組向量目前最大的限制：**它們只證明我方實作符合我方規格。** 要成為真正的一致性套件，需要至少一個不是我們寫的實作跑過它。這組向量是為那件事準備的邀請。
