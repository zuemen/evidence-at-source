# 對帳電路

`reconciliation.circom` 證明兩件事，而且不揭露任何數字：

1. 出示者知道兩張憑證 `valueCommitment` 背後的原像；
2. 那些值算出的對帳結論是某個特定值（0 一致／1 少付／2 溢付）。

第 1 點是關鍵。少了它，證明對任意數字都成立——「我知道一組算得出一致的數字」不等於
「那組數字就是這張憑證裡的數字」。承諾欄位的定義見 [`../docs/credentials.md`](../docs/credentials.md)。

## 取得 circom

本 repo **不含** circom 執行檔。從 <https://github.com/iden3/circom/releases>（本專案用
v2.2.3）下載對應平台的預編譯檔，或以 Rust 自行 build。

## 重建

```bash
CIRCOM=/path/to/circom npm run build:circuit
```

產出在 `circuits/build/`。其中三個檔案**已進 repo**，因此線上 demo 與 CI 不需要 circom
就能產生與驗證證明：

| 檔案 | 大小 | 用途 |
|---|---|---|
| `reconciliation_js/reconciliation.wasm` | 2.07 MB | 產生 witness |
| `reconciliation.zkey` | 0.57 MB | 產生證明 |
| `verification_key.json` | 3 KB | 驗證證明 |

`.ptau`、`.r1cs` 與中間 zkey 合計約 8 MB，可完全重建，因此排除在版控之外。

## 為什麼 powers of tau 是本機產生的

電路只有約 1300 個約束，2^12 的儀式在本機幾秒跑完。少一個外部下載，就少一個
審閱者必須信任的東西。

## 這個 setup 的誠實界限

**powers of tau 與 zkey 的 contribution 都是本機單方產生的，屬 demo 等級。**
正式部署需要多方參與的可信設定儀式——單方 setup 意味著執行 setup 的人若保留了
toxic waste，就能偽造證明。

本專案的主張止於「**伺服器不再看到數字**」，不包含「這個 setup 可以信任到上線」。

## 設計細節

- **不做除法**：`reconcile()` 用浮點數乘 1.34，電路只能算整數。若兩者各自捨入，
  邊界值上會給出不同結論——那比沒有電路更糟。電路改用放大整數，比較式兩邊同乘，
  全程不做除法。`packages/agents/test/zkCircuit.test.ts` 在邊界值上把兩者釘在一起。
- **只有二次約束**：circom 不接受三個 signal 相乘，薪資計算因此拆成中間 signal。
- **salt 必須隱藏**：工時的取值範圍很小，沒有遮罩的承諾可被暴力枚舉反推。
