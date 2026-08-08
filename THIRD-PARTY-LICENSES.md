# 第三方授權 / Third-Party Licenses

本文件列出本專案的第三方相依套件與其授權，並說明**哪些會進入建置產物**。
This document lists third-party dependencies and their licenses, and states
**which of them enter the build output**.

> 撰寫者非法律專業人士，以下為依授權條款文義所作之整理，不構成法律意見。
> Not legal advice — this is a good-faith reading of the license texts.

---

## 一、GPL-3.0 元件（影響散布）/ GPL-3.0 components (affect distribution)

### 會進入網頁建置產物 / Bundled into the web build

`npm run build --workspace @eas/web` 產生的 `packages/web/dist/` 內含以下 GPL-3.0
程式碼。這是實際檢查產物後確認的，不是推測。

| 套件 | 版本 | 授權 | 產出的檔案 | 大小 |
|---|---|---|---|---|
| `snarkjs` | 0.7.6 | GPL-3.0 | `dist/assets/browser.esm-*.js` | 約 275 KB |
| `ffjavascript` | 0.2.63 | GPL-3.0 | 同上（`snarkjs` 的傳遞相依，隨其 browser build 打包） | 含於上列 |
| `circomlibjs` | 0.1.7 | GPL-3.0 | `dist/assets/poseidon_wasm-*.js` | 約 1.86 MB |

合計約 **2.14 MB**，佔建置產物的多數。

**它們為什麼在這裡**：`snarkjs` 用於驗證 Groth16 證明（`packages/agents/src/zkReconciliation.ts`
的 `createGroth16Verifier`、`packages/web/src/demo/world.ts` 的錢包端產證）；
`circomlibjs` 用於 Poseidon 承諾（`packages/shared/src/commitment.ts`）。兩者皆以
`await import()` 動態載入，因此被打包器切成獨立 chunk——**但仍在散布物之內**。

### 僅用於電路編譯期，不進入散布產物 / Build-time only, not distributed

| 套件 | 版本 | 授權 | 說明 |
|---|---|---|---|
| `circomlib` | 2.0.5 | GPL-3.0 | 內容為 104 個 `.circom` 電路模板，供 circom 編譯器使用。`dist/` 中查無其任何字串。 |

`circuits/` 下編譯產物（`.wasm`、`.zkey`）衍生自這些模板，其授權狀態應個別評估；
本專案不將 `circuits/` 的編譯產物包含在 `packages/web/dist/` 之內。

---

## 二、GPL-3.0 對散布的影響 / What this means for distribution

GPL-3.0 §5 要求：與 GPL 程式結合而成的整體作品，散布時須整體適用 GPL-3.0。
JavaScript 打包是否構成「結合作品」或「單純聚合」在實務上仍有討論空間，但
**打包進同一個散布檔案**偏向前者。

因此本專案採取保守且誠實的立場：

- **本專案自撰之原始碼**（`packages/*/src`、`poc/`、`docs/`）依 **MIT** 授權。
- **`packages/web/dist/` 的建置產物**因含上述 GPL-3.0 元件，其**整體散布依 GPL-3.0**。

**若你要複製本 repo**：原始碼本身是 MIT，你可以自由使用；但只要你散布
`packages/web` 的建置產物，你就承擔 GPL-3.0 的義務（包含提供對應原始碼）。
若不希望承擔，可移除 ZK 相關功能，或改為執行時從外部載入 `snarkjs`／`circomlibjs`
而不打包（本專案尚未採此作法）。

---

## 三、其他主要相依套件 / Other principal dependencies

以下為非 copyleft 授權，不影響散布物的整體授權：

| 套件 | 授權 | 用途 |
|---|---|---|
| `@sd-jwt/sd-jwt-vc`、`@sd-jwt/crypto-browser` | Apache-2.0 | SD-JWT VC 選擇性揭露 |
| `jose` | MIT | JWT 簽章與驗證 |
| `@noble/hashes`、`@noble/curves` | MIT | 同構雜湊與 Ed25519 |
| `react`、`react-dom` | MIT | 前端 |
| `vite`、`vitest`、`typescript` | MIT / Apache-2.0 | 建置與測試工具（不進入散布物） |

完整清單可由 `npm ls --all` 取得；各套件授權以其 `package.json` 的 `license`
欄位與隨附授權檔為準。

---

## 四、如何自行驗證 / How to verify this yourself

不要相信這份文件——自己跑一次：

```bash
npm run build --workspace @eas/web
ls -la packages/web/dist/assets/

# 確認 browser.esm-*.js 確為 snarkjs
grep -o "groth16" packages/web/dist/assets/browser.esm-*.js | head

# 確認各套件的授權欄位
node -e "for (const p of ['snarkjs','circomlibjs','circomlib','ffjavascript']) \
  console.log(p, require('./node_modules/'+p+'/package.json').license)"
```
