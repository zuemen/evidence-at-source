# 標準地圖

| | |
|---|---|
| **版本** | 0.1.0 |
| **日期** | 2026-08-21 |
| **授權** | CC BY 4.0 |

**這份文件的用途是防止我們自己誇大。** 每一列都必須標明驗證狀態，而「未驗證」不是可以省略的欄位。

## 對照表

| 標準 | 我們的關係 | 驗證狀態 |
|---|---|---|
| **SD-JWT VC**<br>（draft-ietf-oauth-sd-jwt-vc） | 採用為憑證格式與選擇性揭露機制。實作透過 `@sd-jwt/sd-jwt-vc` 0.20.x | ⚠️ **未驗證**。我們使用該函式庫，但**未對任何 draft 版本執行正式一致性測試**，也未參與互通性活動。「採用一個實作了該 draft 的函式庫」不等於「通過該 draft 的一致性測試」 |
| **W3C VC Data Model 2.0** | 概念上沿用 Issuer／Subject／Holder 的角色劃分 | ❌ **不對位**。我們**不產生** W3C VCDM 形式的憑證，未做 JSON-LD 脈絡對映，也未做任何轉換測試。宣稱「相容 W3C VC」會是錯的 |
| **W3C VC Holder Binding** | 概念參照 | ⚠️ **不同命題**。持有人繫結證明「出示者即持有者」；本專案的雙簽證明「兩造皆同意此紀錄」。兩者解的不是同一個問題，見 [`dual-signature-pairing.md`](dual-signature-pairing.md) 第 9 節 |
| **OpenID4VP** | 出示協定 | ❌ **未實作**。本專案的出示是 demo 內的直接傳遞，沒有 OpenID4VP 的 request／response 流程、沒有 presentation definition、沒有 authorization request。**這是一個真實的落差**：要接進既有的錢包生態系，這一層是必要的 |
| **ACDC / KERI** | `@eas/vlei` 是一個簡化實作：threshold multisig KEL、pre-rotation、TEL 錨定、ACDC edge 與 I2I | ⚠️ **部分驗證**。SAID 計算已與參考沙盒（smpebble/vlei-sandbox，MIT）**逐位元組比對相符**，見 [`../docs/vlei.md`](../docs/vlei.md)。但**不與 keripy／KERIA 互通**：無 CESR stream framing、無 witness、無 delegated AID |
| **GLEIF vLEI EGF** | 信任鏈結構參考（GLEIF 根 → QVI → 法人 → ECR／OOR） | ⚠️ **模擬**。信任根為本地產生的合成根，**非 GLEIF 正式簽發**。Schema SAID 為自算，非官方登錄值。角色憑證發給 AI Agent 的 DID 與稽核機構法人，是對規範的擴充與簡化，逐項說明於 [`../docs/vlei.md`](../docs/vlei.md) |
| **GLEIF 三支柱** | Mandate ✅／Workload ⚠️／Transaction ✅ | ⚠️ **Workload 五層做到兩層**。Build provenance 與 official release 已由 CI 產生 attestation；security assessment、deployment attestation、SPIFFE workload identity **未做**，原因逐項列於 README |
| **RBA Code of Conduct 8.0**（2024） | 判準來源：工時 60 小時／週含加班、每七日一休、加班自願、Employer Pays、90 天償還 | ✅ **條文已對照**，憑證以 `standardVersion` 標記版本。⚠️ 未對照 8.0.1（2025）版的差異 |
| **ILO 強迫勞動指標** | 概念參照（證件扣留不因「同意」而合法化） | ⚠️ **概念層級**，未做逐項指標對映 |
| **本 profile 的新增** | 雙簽配對規則（[`dual-signature-pairing.md`](dual-signature-pairing.md)） | ✅ **有規格、有測試向量、有獨立驗證器**。⚠️ **無第二個獨立實作**——這是它目前還不是標準的原因 |

## 這張表想擋住什麼

一份「我們用了這些標準」的清單，很容易被讀成「我們與這些標準相容」。**那是兩件事。**

- 用了一個實作某 draft 的函式庫 ≠ 通過該 draft 的一致性測試
- 參考了某個信任鏈結構 ≠ 在該生態系中可被驗證
- 對照了某份行為準則的條文 ≠ 通過該準則的稽核

上表中任何標著 ⚠️ 或 ❌ 的項目，**都不應被引用為相容性主張**，包括被我們自己引用。

## 最大的一個落差

**OpenID4VP 未實作**，代表本專案的憑證目前無法透過既有的錢包／驗證方生態系流通。

這不是小事：SD-JWT VC 給了我們憑證格式，OpenID4VP 才是讓憑證能在不同廠商的錢包與驗證方之間傳遞的那一層。沒有它，這套機制只能在自己的 demo 裡運作。

**要進入真實生態系，這是下一個必要的工程項目。** 寫在這裡是因為它比任何已完成的項目都更決定這個專案的實用性。

## 這個專案唯一有資格宣稱「新增」的部分

企業層級憑證有規範（GLEIF vLEI），持有人繫結有規範（W3C VC），選擇性揭露有規範（SD-JWT VC）。

**沒有人規範過「利益相反的雙方共同簽章同一筆事件」。**

這是 [`dual-signature-pairing.md`](dual-signature-pairing.md) 存在的理由，也是這個專案唯一有資格說「我們新增了什麼」的地方。其餘部分都是採用、簡化或參考。
