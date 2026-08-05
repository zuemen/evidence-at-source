# CI + GitHub Pages 線上部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次 push 自動跑全套測試＋typecheck＋vLEI demo，main 全綠即自動部署靜態 demo 站到 GitHub Pages，README 掛線上連結——評審不用 clone 就看得到、也看得到測試在雲端過。

**Architecture:** 單一 workflow 兩個 job：`test`（Node 22、`npm ci`、typecheck、vitest、`demo:vlei` exit-code 閘門、build 靜態站並在 main 上傳 Pages artifact）與 `deploy`（僅 main、官方 `actions/deploy-pages` 流程）。Vite 改用相對 base（`'./'`），使同一份 dist 在 `zuemen.github.io/evidence-at-source/` 子路徑與本機 preview 都能載入——app 無 client-side routing，相對路徑安全。

**Tech Stack:** GitHub Actions（actions/checkout@v4、setup-node@v4、upload-pages-artifact@v3、deploy-pages@v4）、gh CLI（啟用 Pages）。零新 npm 依賴。

## Global Constraints

- Node 22（CI 與本機一致；root `engines: >=22`）。
- 不新增任何 npm 依賴；不動 `poc/`。
- CI 必跑閘門順序：`npm ci` → `npm run typecheck` → `npx vitest run` → `npm run demo:vlei` → build；任何一步紅即不部署。
- 部署走官方 Pages Actions 流程（`build_type=workflow`），不用 gh-pages 分支。
- 文件繁中、YAML 註解英文。

## File Structure

```
.github/workflows/ci.yml       # 新增：test + deploy 兩個 job
packages/web/vite.config.ts    # 修改：base: './'
README.md                      # 修改：CI badge + 線上 demo 連結
```

---

### Task 1: Vite 相對 base（子路徑可部署）

**Files:**
- Modify: `packages/web/vite.config.ts`

- [ ] **Step 1: 加 `base: './'`**

`defineConfig` 物件開頭加一行（`plugins` 之前）：

```ts
export default defineConfig({
  // Relative asset paths: the same dist works at github.io/<repo>/ and locally.
  base: './',
  plugins: [react(), demoApi()],
```

- [ ] **Step 2: 驗證 build 產物用相對路徑**

```bash
cd packages/web && npx vite build && grep -o 'src="./assets/[^"]*"' dist/index.html && cd ../..
```

Expected: grep 印出 `src="./assets/index-….js"`（相對路徑）；build 成功。

- [ ] **Step 3: Commit**

```bash
git add packages/web
git commit -m "build(web): relative base so the static demo deploys under a sub-path"
```

---

### Task 2: CI workflow + 啟用 Pages + 首次部署驗證

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root scripts `typecheck`、`demo:vlei`；workspace script `build --workspace @eas/web`；Task 1 的相對 base。
- Produces: 線上網址 `https://zuemen.github.io/evidence-at-source/`（Task 3 的 README 用）。

- [ ] **Step 1: 寫 `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npx vitest run
      # The judge-facing demo is a gate: exit code 0 means every claim holds.
      - run: npm run demo:vlei
      - name: Build static demo
        run: npm run build --workspace @eas/web
      - uses: actions/upload-pages-artifact@v3
        if: github.ref == 'refs/heads/main'
        with:
          path: packages/web/dist

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 啟用 GitHub Pages（workflow 模式）**

```bash
gh api repos/zuemen/evidence-at-source/pages -X POST -f build_type=workflow
```

若回 409（已存在），改用：

```bash
gh api repos/zuemen/evidence-at-source/pages -X PUT -f build_type=workflow
```

- [ ] **Step 3: Commit + push + 看 run 跑完**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: test gate and GitHub Pages deploy"
git push origin main
gh run watch --exit-status || gh run list --limit 3
```

Expected: run 結束為 success（test + deploy 兩個 job 綠）。

- [ ] **Step 4: 驗證線上網址**

```bash
curl -s -o /dev/null -w "%{http_code}" https://zuemen.github.io/evidence-at-source/
```

Expected: `200`（Pages 首次生效可能需 1–2 分鐘，429/404 時稍候重試一次）。

---

### Task 3: README 掛 badge 與線上連結

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 標題下加 CI badge**

在 `# Evidence at Source（證據前置）` 標題之後、第一段引言之前加：

```markdown
[![CI](https://github.com/zuemen/evidence-at-source/actions/workflows/ci.yml/badge.svg)](https://github.com/zuemen/evidence-at-source/actions/workflows/ci.yml)
```

- [ ] **Step 2: 執行 Demo 段落開頭加線上連結**

`## 執行 Demo` 標題之後加：

```markdown
> **線上版（免安裝）**：<https://zuemen.github.io/evidence-at-source/> —
> main 分支每次全綠自動部署；全部運算在你的瀏覽器內執行，沒有後端。
```

- [ ] **Step 3: Commit + push + 確認 badge 綠**

```bash
git add README.md
git commit -m "docs: CI badge and live demo link"
git push origin main
gh run watch --exit-status
```

Expected: 新 run 綠；README 線上頁 badge 顯示 passing。

---

## Self-Review

**1. Spec coverage** — 測試閘門（typecheck/vitest/demo:vlei）＝Task 2 test job；main 全綠自動部署＝Task 2 deploy job（`needs: test` + `if: main`）；README 線上連結＝Task 3；子路徑資產載入＝Task 1 相對 base。

**2. Placeholder scan** — workflow YAML、指令、README 片段皆為完整內容；無 TBD。

**3. Type consistency** — 網址 `zuemen.github.io/evidence-at-source`、workflow 檔名 `ci.yml`、workspace 名 `@eas/web` 在三個 task 間一致；Pages 流程權限（`pages: write`+`id-token: write`）只在 deploy job。
