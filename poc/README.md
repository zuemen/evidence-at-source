# PoC — 兩個機制的最小可執行證明

這兩支腳本各自證明一件事。它們不是玩具範例，是本專案兩個核心論點的可執行證據。

## 執行

```bash
cd poc
npm install
npm run demo:disclosure
npm run demo:dualsign
```

需要 Node 22 以上（已在 Node 22 與 Node 25 實測通過）。

## `selective-disclosure.mjs` — 證明「品牌拿不到員工明細」

工廠打卡系統簽發一張 `WorkingHoursCredential`，裡面同時有原始工時（`totalHours: 186`、`overtimeHours: 42`）與合規結論（`withinRBALimit: true`）。

勞工出示時，只揭露 `withinRBALimit` 與 `periodStart`。驗證方拿到的 payload 裡**根本不存在** `totalHours` 這個 key——不是被遮蔽、不是被過濾，是密碼學上不在裡面。

預期輸出：

```
VERIFIED payload keys: [ 'iss', 'iat', 'vct', 'workerDID', 'withinRBALimit', 'periodStart' ]
totalHours present? false
withinRBALimit = true
```

`totalHours present? false` 這一行就是論點本身：品牌的稽核 Agent 拿得到「這批工時合規嗎」的答案，拿不到任何一位勞工上了幾小時班。

## `dual-signature.mjs` — 證明「工廠無法單方造假」

流程分四步：

1. 工廠簽發 `WorkingHoursCredential`
2. 勞工用自己的私鑰簽一張 attestation，裡面的 `subjectCredentialHash` 指向工廠那張憑證的 SHA-256
3. 驗證方比對兩者是否配對 → 相符
4. 工廠事後把 186 小時改成 150 小時、加班 42 改成 10，重新簽發一張

第 4 步的新憑證雜湊必然不同，勞工那張 attestation 指向的還是舊雜湊，配對立刻失效。

預期輸出：

```
勞工簽章有效: true
配對雜湊相符: true
篡改後配對是否仍成立: false ← 應為 false
```

最後一行的 `false` 就是論點本身：工廠可以重新簽發任何數字，但拿不到勞工的私鑰，就無法產生一張與新數字配對的勞工反簽。事後修改一定留痕。

## 這兩件事合起來說明什麼

證據在事件發生當下由雙方共同封存（雙簽），事後任一方單獨修改都會被偵測；出示時只揭露結論、不交付原始資料（選擇性揭露）。驗證方問得到答案，拿不到資料。
