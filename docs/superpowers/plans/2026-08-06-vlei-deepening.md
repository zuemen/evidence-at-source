# vLEI 深化規劃：讓「誰可信、憑什麼」全部長在同一條鏈上

**這份計畫回答的問題**：vLEI 目前是機構身分層——它證明「這家機構是誰」。但完整命題（05 Q1／06 Q1／06 Q4）問的其實更多：**這家機構有什麼資格簽這種憑證、背書它的稽核機構本身可不可信、按下核准的那個人憑什麼**。這些現在都還不歸鏈管，而它們每一個都可以歸鏈管。

**排序原則**：先做「把既有主張變成真的」（P1–P3，各半天級），再做敘事擴充（P5–P6），最後才是動到核心驗簽路徑的大工程（P4，可裁）。

---

## P1｜可信層級由鏈決定，不由簽發者自稱

**對應命題**：06 Q1「工廠自我聲明、第三方背書、主管機關認證——三者的可信層級是否需要區分」。

**現況（這是一個真缺口）**：`issuerTier` 是簽發者**自己寫進 payload 的欄位**（`packages/issuer/src/issuer.ts:150`，來自 `options.tier`），L1 閘門讀的就是這個自稱值（`credentialLayer.ts:163`）。一家工廠把 `tier: 'AUTHORITY_CERTIFIED'` 寫進去，現在的閘門攔不住——**tier 分級的整套主張目前立足在「簽發者誠實」上**，這正是本專案最不該有的假設。

**設計**：tier 的現實來源本來就是 QVI 對機構做的資格審查，所以把它放回鏈上：

1. `legalEntity` schema 的 attributes 加 `issuerTier`（QVI 簽發 LE vLEI 時寫入，機構自己改不了——改了 SAID 就斷）。
2. `resolveIssuerSigningKey` 走鏈時同時取出 chain tier，`IssuerSigningKey` 品牌物件多帶一個唯讀 `chainTier`。
3. L1 比對：payload 的 `issuerTier` **高於** chain tier → 拒絕，新原因碼 `ISSUER_TIER_MISMATCH`（低報不罰——自謙不是攻擊）；LE vLEI 沒有 tier → 一律視為 `SELF_DECLARED`。

**改動**：`packages/vlei/src/schemas.ts`、`ecosystem.ts`（`registerLegalEntity` 收 tier）、`packages/agents/src/vleiBridge.ts`、`credentialLayer.ts`、`packages/shared/src/reasonCodes.ts`、demo world 四家機構補 tier、CLAUDE.md 原因碼表。

**測試（逐一寫開）**：工廠 payload 謊稱 T3 被拒＋原因碼／低報通過／LE 無 tier 視為 T1／`minimumIssuerTier` 與 chain tier 的組合。

**Demo 一句話**：「工廠說自己是主管機關？它的法人憑證裡寫的不是——鏈說了算。」

**估時**：半天。

---

## P2｜`verifiedBy` 不能只是一個字串——第三方稽核機構進生態系

**對應命題**：06 Q1 的「第三方稽核機構背書」那一格。

**現況**：T2 憑證的 `verifiedBy` 是**未經驗證的 DID 字串**（`issuer.ts:151` 原樣寫入 payload）。寫 `did:web:sgs.example` 跟寫 `did:web:随便.example` 在閘門眼裡沒有差別——「第三方背書」目前只是一個裝飾欄位。

**設計**：

1. 稽核機構（SGS／BV 這類，合成）成為生態系的 LE，並由其 LE 取得 ECR role `third-party-auditor`。
2. L1 驗 T2 憑證時，`verifiedBy` 必須解析到一條**有效的稽核者鏈**；解析失敗或鏈斷 → 該憑證的有效 tier 降為 `SELF_DECLARED`，在要求 T2 以上的查詢中直接拒絕，新原因碼 `AUDITOR_CHAIN_INVALID`。
3. **撤銷級聯的新故事**：QVI 撤銷稽核機構資格 → 它背書過的**所有 T2 憑證同時降級**——TrustChainPanel 加一顆按鈕就能演，跟現有的 QVI 撤銷級聯同一套機制。

**改動**：`ecosystem.ts`（auditor role）、`vleiBridge.ts`（`resolveAuditorChain`）、`credentialLayer.ts`、reasonCodes、demo world＋TrustChainPanel、tests。

**估時**：半天。

---

## P3｜稽核軌跡與收據的簽章金鑰改由 LE vLEI 取得

**對應命題**：06 Q4「盡職調查證明」。

**現況**：稽核軌跡的封緘金鑰是 demo 裡臨時 `generateKeyPair()` 出來的（`packages/web/src/demo/world.ts:520`），查驗收據同樣。這條鏈驗得過簽章，但**「這把金鑰屬於這家銀行」本身無從驗證**——而整個 repo 的原則是「簽發者公鑰只能從已驗證的法人 vLEI 取得」（L1 已強制），稽核紀錄卻是例外。

**設計**：

1. 封緘金鑰＝驗證方 LE vLEI 裡的 `credentialSigningJwk`——與 L1 憑證驗簽**同一條取鑰路徑**，不再有例外。
2. `verifyAuditTrail`／`verifyReceipt` 增加可選的 vLEI trust context：NGO 拿到可攜出示包（`exportChainArtifacts` 已有）＋匯出的稽核軌跡，**只釘 GLEIF root 就能從鏈根一路驗到每一筆決策的簽章**。
3. 撤銷語義自然延伸：機構的 LE 被撤銷後，**之後**的封緘不再可信；**之前**的仍可驗（金鑰在當時有效），時間界線由 TEL 事件錨定決定——這個「撤銷不消滅歷史、只封鎖未來」的區分正是評審會問的。

**改動**：`auditTrail.ts`／`receipt.ts`（收 IssuerSigningKey 而非裸鑰）、demo world、tests。

**估時**：半天。

---

## P5｜OOR：按下核准的那個人也要有鏈

**對應命題**：06 Q4 深化；也是「建議核准，**待人類覆核**」的閉環。

**現況**：OOR schema 在 `packages/vlei/src/schemas.ts` 裡**完整定義但零使用**。而系統敘事裡最重要的一個人——銀行端做最終決定的覆核主管——目前在證據鏈裡沒有身分。

**設計**：

1. 銀行的覆核主管持 OOR vLEI（`officialRole: 'compliance-officer'`，由銀行 LE 簽發、錨定同一條鏈）。
2. 稽核軌跡的人類決策列多記 `reviewerOorSaid`；`verifyAuditTrail` 可驗「這筆核准當時是由持有效職務憑證的人做的」。
3. OOR 被撤銷（離職、調職）→ 之後以該身分做的覆核無效——與 P3 同一套時間界線語義。

**Demo 一句話**：「不只 Agent 有授權鏈，按下核准的那個人也有。」

**估時**：半天。依賴 P3。

---

## P6｜輸出情境：來源國主管機關作為生態系成員

**對應命題**：05 方向提示「輸出到其他東南亞人力來源國」；補上 adoption-path 第八節目前只有文字沒有 demo 的缺。

**設計**（純 demo＋文件，不動閘門）：

1. `demo:vlei` 加一幕：印尼人力部（合成）取得 LE vLEI，在**母國、出境前**簽發仲介費憑證的來源側。
2. 台灣的銀行驗它：只釘 GLEIF root，走可攜出示包，**不需要跟印尼有任何直連**——這就是「輸出的是憑證格式與信任鏈，不是軟體」的可執行版本。
3. TrustChainPanel 顯示兩國機構掛在同一條鏈下。

**估時**：2–3 小時。

---

## P4｜勞工 KERI AID＋pre-rotation：裝置遺失＝輪替，不是重來（大工程，可裁）

**對應命題**：05 Q1／Q4；README 邊界表明列的「勞工端金鑰輪替未實作」。

**現況**：勞工是裸 ES256 金鑰對。裝置遺失的處理是「撤銷綁定→重新註冊」——身分斷裂，舊反簽全部要重簽。而機構層早就有 pre-rotation（`createAid` 已實作），勞工層沒有。

**設計**：

1. 勞工身分改為 KERI AID（重用 `@eas/vlei` 的 `createAid`，pre-rotation 內建）。
2. `ResidencyCredential` 綁 AID prefix 而非裸 DID；`EnrollmentRegistry` 改讀 KEL 的 `keyStateAt`。
3. 換裝置＝rotation event：舊金鑰即刻失效、**身分連續**、既有反簽在其簽署時點仍可驗（時點語義同 P3）；`bindingCount` 改為 rotation 歷史，換機不再是「第二個錢包」。

**風險（為什麼排最後）**：動到 `verifyPairing` 的 workerPublicKey 取得路徑，影響面橫跨 shared／agents／web 三包與幾十個測試。**時間不夠時的降級**：不動驗簽路徑，只在文件與簡報把「勞工層 pre-rotation」標為與機構層同一機制的直接延伸，附機構層測試為證。

**估時**：1–1.5 天。

---

## 明確不做的

- KERI witnesses／OOBI 解析、真 GLEIF 測試網、`did:webs` 網路解析、多 GLEIF root——全部超出黑客松驗證邊界，寫進 `docs/vlei.md` 的明文簡化清單即可。
- 任何需要真實機構資料的整合。

## 建議順序與檢核

| 順序 | 項目 | 估時 | 驗收 |
|---|---|---|---|
| 1 | P1 tier 由鏈決定 | 0.5 天 | 謊稱 T3 被 `ISSUER_TIER_MISMATCH` 拒，測試逐一寫開 |
| 2 | P2 verifiedBy 可驗證 | 0.5 天 | 撤銷稽核機構 → T2 全面降級，面板可演 |
| 3 | P3 稽核簽章上鏈 | 0.5 天 | NGO 只釘 root 可驗整條軌跡 |
| 4 | P5 OOR 覆核者 | 0.5 天 | 撤銷 OOR → 其後覆核無效 |
| 5 | P6 來源國輸出幕 | 0.25 天 | `demo:vlei` 新步驟 exit 0 |
| 6 | P4 勞工 AID（可裁） | 1–1.5 天 | 換裝置後身分連續、舊簽仍可驗 |

每一步完成即跑全套（測試數變動要同步四份公開文件，守門測試會抓）。P1–P3 做完，vLEI 的故事就從「機構身分可驗證」升級為「**資格、背書、紀錄、決策者——全部錨定同一條可撤銷的鏈**」，這句話目前市面上沒有第二個黑客松作品講得出來。
