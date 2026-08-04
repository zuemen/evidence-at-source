# 命題滿足度修補 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊題目 05／06 命題明文要求但現況未做的檢核點，把「及格線」補到與現有創新（雙簽、交叉驗證、被觀察方保護）同等完整。

**Architecture:** 全部沿用既有 monorepo 分層（shared 密碼學與型別、issuer 簽發、agents 閘門與 Agent、web demo）。新增五個彼此邊界清楚的能力：簽發者可信層級（envelope 欄位 + 驗證方門檻）、查驗收據（可獨立驗簽的 JWT）、查驗日誌與撤銷反向通知、跨機構申辦異常偵測、產線綁定與 RBA 項目分類。每個能力都是純函式或小型狀態物件，可獨立測試。

**Tech Stack:** TypeScript / Node 22 / vitest / SD-JWT VC（`@sd-jwt/crypto-browser`）/ `jose` / `@noble/hashes`（同構同步雜湊）。

## Global Constraints

- **CLAUDE.md 四原則全程遵守**：不新增任何禁用函式（`approveAccount`／`rejectAccount`／`freezeAccount`／`transferFunds`／`readTransactionHistory`）；輸出只回布林／匯總／原因碼，不洩漏原始欄位；合成資料；Policy Gate 判斷路徑無 LLM。`principleOne.test.ts` 與 T8 no-LLM 守門測試全程綠燈。
- **紅線（使用者明訂）**：查證清單 Q1–Q5 有結論前，**不得更動 `RecruitmentFeeCredential` 的費用判準欄位（`feeWithinLegalCap` 等）與交叉驗證（M7）的論述**。本計畫的 `issuerTier` 是 envelope 欄位（與 `iss`／`iat`／`vct`／`exp` 同層），**不進任何憑證的 disclosure schema**，因此不觸及 RecruitmentFee 的欄位或費用邏輯。
- **命名慣例**：原因碼 SCREAMING_SNAKE_CASE；型別 PascalCase。
- **同構密碼學**：新程式碼一律用 `@eas/shared` 匯出的 `sha256Base64url`／`sha256Hex`／`base64urlToUtf8`，或 `jose`（皆瀏覽器相容）；**不得** `import 'node:crypto'` 或用 `Buffer`（會破壞 S3 的靜態瀏覽器建置）。
- **每個 Task 結束**：`npx vitest run` 全綠 + `npx tsc --noEmit` 乾淨 + 禁用函式掃描通過，再 commit。基準：目前 **119 測試**。

### 對照分析的兩處事實修正（實作者必讀）

1. **「恢復契約知情同意憑證」不需要做**——`ContractConsentCredential` **已存在**於 `CREDENTIAL_TYPES`（五張憑證：RecruitmentFee／DocumentCustody／ContractConsent／WorkingHours／SalaryDeposit 全在）。分析文件的「v2 砍除」是對舊規格而言，與現況不符。本計畫不含此項。
2. **沒有既有的 hash-chain 審計鏈**——分析所稱「hash chain 審計鏈」在現況只是 T9 差分偵測裡的一個 `auditRef` 遞增計數（`packages/agents/src/differencing.ts`），不是可驗證的持久日誌。因此查驗收據（Task 3）與查驗日誌（Task 4）從零建立，不依賴任何既有審計鏈。

---

## File Structure

| 路徑 | 責任 | Task |
|---|---|---|
| `packages/shared/src/issuerTier.ts` | `IssuerTier` 型別、排序、比較 | 1 |
| `packages/shared/src/reasonCodes.ts`（改） | 新增 `ISSUER_TIER_BELOW_THRESHOLD`、`CREDENTIAL_FACILITY_MISMATCH`、`REQUIRES_ONSITE_AUDIT` | 2,6,7 |
| `packages/issuer/src/issuer.ts`（改） | `createIssuer` 帶 tier／verifiedBy／facilityId，`issue()` 蓋進 envelope | 1,6 |
| `packages/agents/src/credentialLayer.ts`（改） | L1 新增 `minimumIssuerTier` 與 `expectedFacilityId` 檢查 | 2,6 |
| `packages/agents/src/receipt.ts` | 查驗收據簽發與驗簽 | 3 |
| `packages/agents/src/verificationLog.ts` | 查驗日誌（反向索引）＋撤銷通知 | 4 |
| `packages/agents/src/applicationMonitor.ts` | 跨機構申辦匿名計數與門檻 | 5 |
| `packages/agents/src/bankAgent.ts`（改） | `assess` 吃選填風險訊號，輸出 `riskFlags` | 5 |
| `packages/agents/src/rbaItems.ts` | RBA 項目分類表（可憑證化 vs 須實地） | 7 |
| `docs/credentials.md`（改） | 記錄 envelope 的 `issuerTier`／`facilityId` | 1,6 |
| `README.md`（改） | 命題對照更新、issuerTier 段落 | 每 Task 收尾 |

---

## Task 1: 簽發者可信層級（issuerTier envelope 欄位）

**Files:**
- Create: `packages/shared/src/issuerTier.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/issuer/src/issuer.ts`
- Test: `packages/shared/test/issuerTier.test.ts`, `packages/issuer/test/issuerTier.test.ts`

**Interfaces:**
- Produces: `type IssuerTier = 'SELF_DECLARED' | 'THIRD_PARTY_VERIFIED' | 'AUTHORITY_CERTIFIED'`；`tierRank(t: IssuerTier): number`（0/1/2）；`meetsMinimumTier(actual: IssuerTier, minimum: IssuerTier): boolean`。`createIssuer(did, options)` 的 `options` 新增 `tier?: IssuerTier`（預設 `'SELF_DECLARED'`）、`verifiedBy?: string`；`issue()` 產出的 payload envelope 內含 `issuerTier` 與（若有）`verifiedBy`。

- [ ] **Step 1: Write the failing test（型別與排序）**

```typescript
// packages/shared/test/issuerTier.test.ts
import { describe, expect, test } from 'vitest';
import { meetsMinimumTier, tierRank } from '@eas/shared';

describe('issuer tier', () => {
  test('ranks self-declared below third-party below authority', () => {
    expect(tierRank('SELF_DECLARED')).toBe(0);
    expect(tierRank('THIRD_PARTY_VERIFIED')).toBe(1);
    expect(tierRank('AUTHORITY_CERTIFIED')).toBe(2);
  });

  test('meetsMinimumTier is true only at or above the threshold', () => {
    expect(meetsMinimumTier('THIRD_PARTY_VERIFIED', 'THIRD_PARTY_VERIFIED')).toBe(true);
    expect(meetsMinimumTier('AUTHORITY_CERTIFIED', 'THIRD_PARTY_VERIFIED')).toBe(true);
    expect(meetsMinimumTier('SELF_DECLARED', 'THIRD_PARTY_VERIFIED')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/test/issuerTier.test.ts`
Expected: FAIL — `meetsMinimumTier`/`tierRank` not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/issuerTier.ts
/**
 * Issuer trust tier — 題06 Q1. A verifier can see how much to trust a
 * credential's issuer, and can require a minimum tier. This is the concrete
 * form of "第三方驗證" (T2) and "主管機關認證" (T3).
 */
export const ISSUER_TIERS = [
  'SELF_DECLARED',        // T1: factory / agency self-attestation
  'THIRD_PARTY_VERIFIED', // T2: audit body or bank endorsement
  'AUTHORITY_CERTIFIED',  // T3: government authority certification
] as const;

export type IssuerTier = (typeof ISSUER_TIERS)[number];

export function tierRank(tier: IssuerTier): number {
  return ISSUER_TIERS.indexOf(tier);
}

export function meetsMinimumTier(actual: IssuerTier, minimum: IssuerTier): boolean {
  return tierRank(actual) >= tierRank(minimum);
}
```

Then add to `packages/shared/src/index.ts` after the reason-code exports:

```typescript
export { ISSUER_TIERS, meetsMinimumTier, tierRank } from './issuerTier.js';
export type { IssuerTier } from './issuerTier.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/test/issuerTier.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test（issuer 蓋進 envelope）**

```typescript
// packages/issuer/test/issuerTier.test.ts
import { describe, expect, test } from 'vitest';
import { generateKeyPair, presentCredential, verifyPresentation } from '@eas/shared';
import { createIssuer } from '@eas/issuer';

describe('issuer stamps its trust tier', () => {
  test('defaults to SELF_DECLARED when no tier is given', async () => {
    const factory = await createIssuer('did:web:factory.example');
    const credential = await factory.issue('WorkingHoursCredential', {
      workerDID: 'did:key:zWorker001',
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
    });
    const verified = await verifyPresentation(
      await presentCredential(credential, ['withinRBALimit']),
      factory.publicKey,
    );

    expect(verified.payload['issuerTier']).toBe('SELF_DECLARED');
  });

  test('stamps THIRD_PARTY_VERIFIED and verifiedBy when configured', async () => {
    const auditor = await createIssuer('did:web:sgs.example', {
      tier: 'THIRD_PARTY_VERIFIED',
      verifiedBy: 'did:web:sgs.example',
    });
    const credential = await auditor.issue('WorkingHoursCredential', {
      workerDID: 'did:key:zWorker001',
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
    });
    const verified = await verifyPresentation(
      await presentCredential(credential, ['withinRBALimit']),
      auditor.publicKey,
    );

    expect(verified.payload['issuerTier']).toBe('THIRD_PARTY_VERIFIED');
    expect(verified.payload['verifiedBy']).toBe('did:web:sgs.example');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run packages/issuer/test/issuerTier.test.ts`
Expected: FAIL — `issuerTier` is `undefined` in payload.

- [ ] **Step 7: Write minimal implementation**

In `packages/issuer/src/issuer.ts`, extend imports and `IssuerOptions`, and stamp the envelope. Change the import block to add `IssuerTier`:

```typescript
import {
  DEFAULT_DELEGATION_LIFETIME_SECONDS,
  DELEGATION_VCT,
  generateKeyPair,
  getCredentialSchema,
  signCredential,
  type AllowedQueryType,
  type CredentialType,
  type IssuerTier,
  type PublicJwk,
} from '@eas/shared';
```

Extend `IssuerOptions`:

```typescript
export interface IssuerOptions {
  readonly credentialLifetimeSeconds?: number;
  readonly tier?: IssuerTier;
  readonly verifiedBy?: string;
}
```

In `createIssuer`, after `const lifetime = ...`, add:

```typescript
  const tier: IssuerTier = options.tier ?? 'SELF_DECLARED';
  const verifiedBy = options.verifiedBy;
```

In `issue()`, change the envelope so tier goes in last (cannot be spoofed via claims):

```typescript
      const payload = {
        ...claims,
        iss: did,
        iat: issuedAt,
        vct: type,
        exp: issuedAt + lifetime,
        issuerTier: tier,
        ...(verifiedBy === undefined ? {} : { verifiedBy }),
      };
```

- [ ] **Step 8: Run tests to verify pass + full suite green**

Run: `npx vitest run packages/issuer/test/issuerTier.test.ts && npx vitest run && npx tsc --noEmit`
Expected: new tests PASS; all 119+4 tests PASS; typecheck clean.

- [ ] **Step 9: Document + Commit**

Add to `docs/credentials.md` common-fields table a row: `| `issuerTier` | string | 公開（envelope） | 簽發者可信層級：SELF_DECLARED／THIRD_PARTY_VERIFIED／AUTHORITY_CERTIFIED |` and `| `verifiedBy` | string（選填） | 公開（envelope） | T2 時記錄背書機構 DID |`.

```bash
git add -A
git commit -m "feat(shared,issuer): issuer trust tier (issuerTier envelope) — 題06 Q1"
```

---

## Task 2: 驗證方最低層級門檻（minimumIssuerTier）

**Files:**
- Modify: `packages/shared/src/reasonCodes.ts`
- Modify: `packages/shared/src/delegation.ts`
- Modify: `packages/agents/src/credentialLayer.ts`
- Test: `packages/agents/test/issuerTierGate.test.ts`

**Interfaces:**
- Consumes: `IssuerTier`, `meetsMinimumTier` (Task 1); `CredentialLayerInput` (existing).
- Produces: reason code `ISSUER_TIER_BELOW_THRESHOLD`；`CredentialLayerInput` 新增 `minimumIssuerTier?: IssuerTier`；`DelegationClaims` 新增 `minimumIssuerTier?: IssuerTier`。當出示憑證的 `issuerTier` 低於門檻時，L1 回 `ISSUER_TIER_BELOW_THRESHOLD`。

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agents/test/issuerTierGate.test.ts
import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { checkCredentialLayer } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

async function present(tier: 'SELF_DECLARED' | 'THIRD_PARTY_VERIFIED') {
  const issuer = await createIssuer('did:web:factory.example', { tier });
  const worker = await generateKeyPair();
  const credential = await issuer.issue('WorkingHoursCredential', {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
  });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });
  return {
    issuer,
    worker,
    attestation,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
  };
}

describe('L1 — minimum issuer tier', () => {
  test('refuses a self-declared credential when the verifier requires third-party', async () => {
    const p = await present('SELF_DECLARED');

    const decision = await checkCredentialLayer({
      presentation: p.presentation,
      attestation: p.attestation,
      issuerPublicKey: p.issuer.publicKey,
      workerPublicKey: p.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      minimumIssuerTier: 'THIRD_PARTY_VERIFIED',
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('ISSUER_TIER_BELOW_THRESHOLD');
  });

  test('admits a third-party credential at the same threshold', async () => {
    const p = await present('THIRD_PARTY_VERIFIED');

    const decision = await checkCredentialLayer({
      presentation: p.presentation,
      attestation: p.attestation,
      issuerPublicKey: p.issuer.publicKey,
      workerPublicKey: p.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      minimumIssuerTier: 'THIRD_PARTY_VERIFIED',
    });

    expect(decision.ok).toBe(true);
  });

  test('no threshold means any tier is admitted (existing behaviour unchanged)', async () => {
    const p = await present('SELF_DECLARED');

    const decision = await checkCredentialLayer({
      presentation: p.presentation,
      attestation: p.attestation,
      issuerPublicKey: p.issuer.publicKey,
      workerPublicKey: p.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agents/test/issuerTierGate.test.ts`
Expected: FAIL — `ISSUER_TIER_BELOW_THRESHOLD` not a valid reason / not enforced.

- [ ] **Step 3: Add the reason code**

In `packages/shared/src/reasonCodes.ts`, add to the L0/L1 area (after `CLAIM_NOT_DISCLOSED`/`POLICY_CHECK_FAILED`):

```typescript
  // A credential's issuer trust tier is below what the verifier requires (題06 Q1).
  'ISSUER_TIER_BELOW_THRESHOLD',
```

Add the same row to `CLAUDE.md`'s reason-code table with layer `L1`.

- [ ] **Step 4: Enforce in the credential layer**

In `packages/agents/src/credentialLayer.ts`, extend the import from `@eas/shared` to add `meetsMinimumTier` and `type IssuerTier`. Add to `CredentialLayerInput`:

```typescript
  /** If set, the credential's issuerTier must be at or above this. */
  readonly minimumIssuerTier?: IssuerTier;
```

After the expiry check and before the `requiredClaims` loop, add:

```typescript
  if (input.minimumIssuerTier !== undefined) {
    const tier = payload['issuerTier'];
    const ok = typeof tier === 'string' && meetsMinimumTier(tier as IssuerTier, input.minimumIssuerTier);
    if (!ok) {
      return { ok: false, reason: 'ISSUER_TIER_BELOW_THRESHOLD' };
    }
  }
```

Also add `minimumIssuerTier?: IssuerTier` to `DelegationClaims` in `packages/shared/src/delegation.ts` (documenting the verifier's declared policy; enforcement is wired where a delegation drives L1, but the L1 param above is the mechanism). Add:

```typescript
  /** Optional: the minimum issuer tier this agent's principal will accept. */
  readonly minimumIssuerTier?: AllowedQueryType extends never ? never : import('./issuerTier.js').IssuerTier;
```

(If the inline import form is awkward, instead add `import type { IssuerTier } from './issuerTier.js';` at the top of `delegation.ts` and use `readonly minimumIssuerTier?: IssuerTier;`.)

- [ ] **Step 5: Run tests + full suite**

Run: `npx vitest run packages/agents/test/issuerTierGate.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 3 new tests PASS; full suite PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agents): minimum issuer tier gate (ISSUER_TIER_BELOW_THRESHOLD) — 題06 Q1"
```

---

## Task 3: 查驗收據（可獨立驗簽的盡職調查證明）

**Files:**
- Create: `packages/agents/src/receipt.ts`
- Modify: `packages/agents/src/index.ts`
- Test: `packages/agents/test/receipt.test.ts`

**Interfaces:**
- Consumes: `credentialHash`, `PrivateJwk`, `PublicJwk` (shared); `jose`.
- Produces: `issueVerificationReceipt(verifierPrivateKey, input): Promise<string>`（回傳簽章 JWT）；`verifyReceipt(receipt, verifierPublicKey): Promise<VerificationReceipt | null>`。`VerificationReceipt` 欄位：`verifierDid`、`subjectCredentialHash`、`verifiedItems: string[]`、`result: 'PASS' | 'FAIL'`、`verifiedAt`。**收據不得含任何原始欄位或勞工識別碼以外的個資**（`verifiedItems` 是項目名，不是值）。

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agents/test/receipt.test.ts
import { describe, expect, test } from 'vitest';
import { generateKeyPair } from '@eas/shared';
import { issueVerificationReceipt, verifyReceipt } from '@eas/agents';

describe('verification receipt', () => {
  const base = {
    verifierDid: 'did:web:brand.example',
    subjectCredentialHash: 'abc123',
    verifiedItems: ['withinRBALimit'],
    result: 'PASS' as const,
    verifiedAt: '2026-08-04T10:00:00Z',
  };

  test('a receipt round-trips and verifies under the verifier key', async () => {
    const verifier = await generateKeyPair();

    const receipt = await issueVerificationReceipt(verifier.privateKey, base);
    const read = await verifyReceipt(receipt, verifier.publicKey);

    expect(read?.verifierDid).toBe('did:web:brand.example');
    expect(read?.verifiedItems).toEqual(['withinRBALimit']);
    expect(read?.result).toBe('PASS');
  });

  test('a receipt does not verify under a different key', async () => {
    const verifier = await generateKeyPair();
    const impostor = await generateKeyPair();

    const receipt = await issueVerificationReceipt(verifier.privateKey, base);

    expect(await verifyReceipt(receipt, impostor.publicKey)).toBeNull();
  });

  test('the receipt carries item names, never raw values', async () => {
    const verifier = await generateKeyPair();

    const receipt = await issueVerificationReceipt(verifier.privateKey, base);

    // The item name may appear; a raw hour count must never.
    expect(receipt).not.toContain('186');
    expect(receipt).not.toContain('totalHours');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agents/test/receipt.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/agents/src/receipt.ts
/**
 * Verification receipt — 題06 Q4. When a verifier checks a credential, it can
 * mint a signed, independently-verifiable receipt: "this verifier, at this time,
 * verified these items on this credential, with this result." It is the
 * presentable due-diligence proof a brand can show an NGO or consumer.
 *
 * A receipt records item *names* and a credential *hash* — never a raw value.
 */
import { SignJWT, jwtVerify, importJWK, type JWK } from 'jose';
import type { PrivateJwk, PublicJwk } from '@eas/shared';

export const RECEIPT_TYP = 'verification-receipt+jwt';

export type VerificationResult = 'PASS' | 'FAIL';

export interface VerificationReceipt {
  readonly verifierDid: string;
  readonly subjectCredentialHash: string;
  readonly verifiedItems: readonly string[];
  readonly result: VerificationResult;
  readonly verifiedAt: string;
}

export async function issueVerificationReceipt(
  verifierPrivateKey: PrivateJwk,
  receipt: VerificationReceipt,
): Promise<string> {
  const key = await importJWK(verifierPrivateKey as JWK, 'ES256');

  return new SignJWT({
    subjectCredentialHash: receipt.subjectCredentialHash,
    verifiedItems: [...receipt.verifiedItems],
    result: receipt.result,
    verifiedAt: receipt.verifiedAt,
  })
    .setProtectedHeader({ alg: 'ES256', typ: RECEIPT_TYP })
    .setIssuer(receipt.verifierDid)
    .sign(key);
}

export async function verifyReceipt(
  receipt: string,
  verifierPublicKey: PublicJwk,
): Promise<VerificationReceipt | null> {
  try {
    const key = await importJWK(verifierPublicKey as JWK, 'ES256');
    const { payload } = await jwtVerify(receipt, key);
    const items = payload['verifiedItems'];

    return {
      verifierDid: String(payload['iss']),
      subjectCredentialHash: String(payload['subjectCredentialHash']),
      verifiedItems: Array.isArray(items) ? (items as string[]) : [],
      result: payload['result'] === 'FAIL' ? 'FAIL' : 'PASS',
      verifiedAt: String(payload['verifiedAt']),
    };
  } catch {
    return null;
  }
}
```

Add to `packages/agents/src/index.ts`:

```typescript
export { RECEIPT_TYP, issueVerificationReceipt, verifyReceipt } from './receipt.js';
export type { VerificationReceipt, VerificationResult } from './receipt.js';
```

- [ ] **Step 4: Run tests + full suite**

Run: `npx vitest run packages/agents/test/receipt.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 3 new tests PASS; full suite PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agents): signed verification receipt (presentable due-diligence proof) — 題06 Q4"
```

---

## Task 4: 查驗日誌與撤銷反向通知

**Files:**
- Create: `packages/agents/src/verificationLog.ts`
- Modify: `packages/agents/src/index.ts`
- Test: `packages/agents/test/verificationLog.test.ts`

**Interfaces:**
- Consumes: `VerificationReceipt` (Task 3).
- Produces: `createVerificationLog(): VerificationLog`。`VerificationLog` 方法：`record(receipt: VerificationReceipt): void`；`verifiersOf(subjectCredentialHash: string): readonly string[]`（曾驗過該憑證的 verifier DID，去重）；`notifyRevocation(subjectCredentialHash: string): readonly RevocationNotice[]`，`RevocationNotice = { verifierDid: string; subjectCredentialHash: string }`。**通知只含 verifier DID 與憑證 hash，不含勞工識別資訊。**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agents/test/verificationLog.test.ts
import { describe, expect, test } from 'vitest';
import { createVerificationLog, type VerificationReceipt } from '@eas/agents';

const receipt = (verifierDid: string, hash: string): VerificationReceipt => ({
  verifierDid,
  subjectCredentialHash: hash,
  verifiedItems: ['withinRBALimit'],
  result: 'PASS',
  verifiedAt: '2026-08-04T10:00:00Z',
});

describe('verification log and revocation notification', () => {
  test('records who verified which credential, de-duplicated', () => {
    const log = createVerificationLog();
    log.record(receipt('did:web:brand-a.example', 'hash-1'));
    log.record(receipt('did:web:brand-b.example', 'hash-1'));
    log.record(receipt('did:web:brand-a.example', 'hash-1'));

    expect([...log.verifiersOf('hash-1')].sort()).toEqual([
      'did:web:brand-a.example',
      'did:web:brand-b.example',
    ]);
  });

  test('revocation produces one notice per prior verifier of that credential', () => {
    const log = createVerificationLog();
    log.record(receipt('did:web:brand-a.example', 'hash-1'));
    log.record(receipt('did:web:brand-b.example', 'hash-1'));
    log.record(receipt('did:web:brand-c.example', 'hash-2'));

    const notices = log.notifyRevocation('hash-1');

    expect(notices.map((n) => n.verifierDid).sort()).toEqual([
      'did:web:brand-a.example',
      'did:web:brand-b.example',
    ]);
    expect(notices.every((n) => n.subjectCredentialHash === 'hash-1')).toBe(true);
  });

  test('a notice carries no worker identifier', () => {
    const log = createVerificationLog();
    log.record(receipt('did:web:brand-a.example', 'hash-1'));

    expect(JSON.stringify(log.notifyRevocation('hash-1'))).not.toContain('zWorker');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agents/test/verificationLog.test.ts`
Expected: FAIL — `createVerificationLog` not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/agents/src/verificationLog.ts
/**
 * Verification log and revocation notification — the second half of 題06 Q5.
 *
 * Expiry and cascade revocation already exist; what was missing is the reverse
 * path: when a credential is revoked, tell every brand that previously verified
 * it. This log is the reverse index (credential hash -> verifiers) that makes
 * that push possible. It holds verifier DIDs and credential hashes only — never
 * a worker identifier.
 */
import type { VerificationReceipt } from './receipt.js';

export interface RevocationNotice {
  readonly verifierDid: string;
  readonly subjectCredentialHash: string;
}

export interface VerificationLog {
  record(receipt: VerificationReceipt): void;
  verifiersOf(subjectCredentialHash: string): readonly string[];
  notifyRevocation(subjectCredentialHash: string): readonly RevocationNotice[];
}

export function createVerificationLog(): VerificationLog {
  const byCredential = new Map<string, Set<string>>();

  return {
    record(receipt) {
      const set = byCredential.get(receipt.subjectCredentialHash) ?? new Set<string>();
      set.add(receipt.verifierDid);
      byCredential.set(receipt.subjectCredentialHash, set);
    },
    verifiersOf(hash) {
      return [...(byCredential.get(hash) ?? new Set<string>())];
    },
    notifyRevocation(hash) {
      return [...(byCredential.get(hash) ?? new Set<string>())].map((verifierDid) => ({
        verifierDid,
        subjectCredentialHash: hash,
      }));
    },
  };
}
```

Add to `packages/agents/src/index.ts`:

```typescript
export { createVerificationLog } from './verificationLog.js';
export type { RevocationNotice, VerificationLog } from './verificationLog.js';
```

- [ ] **Step 4: Run tests + full suite**

Run: `npx vitest run packages/agents/test/verificationLog.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 3 new tests PASS; full suite PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agents): verification log + revocation notification to prior verifiers — 題06 Q5"
```

---

## Task 5: 跨機構申辦異常偵測（題05 Q3）

**Files:**
- Create: `packages/agents/src/applicationMonitor.ts`
- Modify: `packages/agents/src/index.ts`
- Modify: `packages/agents/src/bankAgent.ts`
- Test: `packages/agents/test/applicationMonitor.test.ts`

**Interfaces:**
- Produces: `createApplicationMonitor(options?: { threshold?: number }): ApplicationMonitor`（`threshold` 預設 3）。`ApplicationMonitor` 方法：`record(workerDid: string): void`；`risk(workerDid: string): { count: number; flagged: boolean }`。`bankAgent.assess(facts, risk?)` 新增選填第二參數 `risk?: { flagged: boolean }`；`BankAssessment` 新增 `riskFlags: readonly string[]`（`flagged` 時含 `'MULTIPLE_APPLICATIONS'`）。**不新增任何帳戶動作函式；不改變 `assess` 只有一個對外方法的事實。**

- [ ] **Step 1: Write the failing test（monitor）**

```typescript
// packages/agents/test/applicationMonitor.test.ts
import { describe, expect, test } from 'vitest';
import { createApplicationMonitor, createBankAgent } from '@eas/agents';

describe('cross-institution application monitor (題05 Q3)', () => {
  test('flags a worker DID that applies more than the threshold', () => {
    const monitor = createApplicationMonitor({ threshold: 3 });
    const did = 'did:key:zWorker001';

    monitor.record(did);
    monitor.record(did);
    expect(monitor.risk(did).flagged).toBe(false);

    monitor.record(did);
    monitor.record(did);
    const risk = monitor.risk(did);
    expect(risk.count).toBe(4);
    expect(risk.flagged).toBe(true);
  });

  test('the bank assessment surfaces a risk flag but stays advisory', () => {
    const agent = createBankAgent();

    const assessment = agent.assess(
      {
        feeWithinLegalCap: true,
        passportHeldByWorker: true,
        nativeLanguageVersionProvided: true,
      },
      { flagged: true },
    );

    expect(assessment.riskFlags).toContain('MULTIPLE_APPLICATIONS');
    expect(assessment.requiresHumanReview).toBe(true);
  });

  test('the bank agent still exposes only assess', () => {
    const agent = createBankAgent();
    expect(Object.keys(agent)).toEqual(['assess']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agents/test/applicationMonitor.test.ts`
Expected: FAIL — `createApplicationMonitor` missing / `riskFlags` missing.

- [ ] **Step 3: Write the monitor**

```typescript
// packages/agents/src/applicationMonitor.ts
/**
 * Cross-institution application-frequency monitor — 題05 Q3.
 *
 * Many account applications under one identity in a short window is the classic
 * mule-account fingerprint. This is an anonymised counter keyed by worker DID; a
 * verifier can ask "is this applicant over the threshold?" and get a boolean —
 * never a list of where they applied.
 */
export interface ApplicationRisk {
  readonly count: number;
  readonly flagged: boolean;
}

export interface ApplicationMonitor {
  record(workerDid: string): void;
  risk(workerDid: string): ApplicationRisk;
}

export const DEFAULT_APPLICATION_THRESHOLD = 3;

export function createApplicationMonitor(
  options: { threshold?: number } = {},
): ApplicationMonitor {
  const threshold = options.threshold ?? DEFAULT_APPLICATION_THRESHOLD;
  const counts = new Map<string, number>();

  return {
    record(workerDid) {
      counts.set(workerDid, (counts.get(workerDid) ?? 0) + 1);
    },
    risk(workerDid) {
      const count = counts.get(workerDid) ?? 0;
      return { count, flagged: count > threshold };
    },
  };
}
```

Add to `packages/agents/src/index.ts`:

```typescript
export { DEFAULT_APPLICATION_THRESHOLD, createApplicationMonitor } from './applicationMonitor.js';
export type { ApplicationMonitor, ApplicationRisk } from './applicationMonitor.js';
```

- [ ] **Step 4: Wire the risk flag into the bank assessment**

In `packages/agents/src/bankAgent.ts`, extend `BankAssessment`:

```typescript
export interface BankAssessment {
  readonly recommendation: Recommendation;
  readonly reasons: readonly ReasonCode[];
  readonly requiresHumanReview: true;
  readonly riskFlags: readonly string[];
}
```

Change the `BankAgent` interface's method and the returned `assess` to accept optional risk and emit `riskFlags`:

```typescript
export interface BankAgent {
  assess(facts: DisclosedFacts, risk?: { readonly flagged: boolean }): BankAssessment;
}
```

In the `assess` implementation, build `riskFlags` and include it in the returned object:

```typescript
    assess(facts, risk) {
      const reasons: ReasonCode[] = [];
      for (const fact of REQUIRED_FACTS) {
        if (facts[fact] === undefined) {
          reasons.push('CLAIM_NOT_DISCLOSED');
        } else if (facts[fact] === false) {
          reasons.push('POLICY_CHECK_FAILED');
        }
      }

      const riskFlags = risk?.flagged === true ? ['MULTIPLE_APPLICATIONS'] : [];

      return {
        recommendation:
          reasons.length === 0 ? 'APPROVE_PENDING_HUMAN_REVIEW' : 'DECLINE_PENDING_HUMAN_REVIEW',
        reasons,
        requiresHumanReview: true,
        riskFlags,
      };
    },
```

- [ ] **Step 5: Run tests + full suite**

Run: `npx vitest run packages/agents/test/applicationMonitor.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 3 new tests PASS; the existing `bankAgent.test.ts` (which asserts `Object.keys(agent) === ['assess']`) still PASS; full suite PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agents): cross-institution application monitor + bank risk flag — 題05 Q3"
```

---

## Task 6: 憑證綁定 facilityId（GS1／產線挪用防護，應補）

**Files:**
- Modify: `packages/shared/src/reasonCodes.ts`
- Modify: `packages/issuer/src/issuer.ts`
- Modify: `packages/agents/src/credentialLayer.ts`
- Test: `packages/agents/test/facilityBinding.test.ts`

**Interfaces:**
- Consumes: issuer envelope (Task 1); `CredentialLayerInput`.
- Produces: reason code `CREDENTIAL_FACILITY_MISMATCH`；`createIssuer` options 新增 `facilityId?: string`（GS1／工廠識別碼），`issue()` 蓋進 envelope 為 `facilityId`；`CredentialLayerInput` 新增 `expectedFacilityId?: string`。憑證的 `facilityId` 與 `expectedFacilityId` 不符時回 `CREDENTIAL_FACILITY_MISMATCH`。

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agents/test/facilityBinding.test.ts
import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { checkCredentialLayer } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

async function present(facilityId: string) {
  const issuer = await createIssuer('did:web:factory.example', { facilityId });
  const worker = await generateKeyPair();
  const credential = await issuer.issue('WorkingHoursCredential', {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
  });
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });
  return {
    issuer,
    worker,
    attestation,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
  };
}

describe('L1 — facility binding (GS1)', () => {
  test('refuses a credential from factory A when B is expected', async () => {
    const p = await present('gs1:factory-a');

    const decision = await checkCredentialLayer({
      presentation: p.presentation,
      attestation: p.attestation,
      issuerPublicKey: p.issuer.publicKey,
      workerPublicKey: p.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      expectedFacilityId: 'gs1:factory-b',
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_FACILITY_MISMATCH');
  });

  test('admits a credential whose facility matches', async () => {
    const p = await present('gs1:factory-a');

    const decision = await checkCredentialLayer({
      presentation: p.presentation,
      attestation: p.attestation,
      issuerPublicKey: p.issuer.publicKey,
      workerPublicKey: p.worker.publicKey,
      requiredClaims: ['withinRBALimit'],
      expectedFacilityId: 'gs1:factory-a',
    });

    expect(decision.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agents/test/facilityBinding.test.ts`
Expected: FAIL — facility not stamped / not checked.

- [ ] **Step 3: Stamp facilityId in the issuer**

In `packages/issuer/src/issuer.ts`, add `readonly facilityId?: string;` to `IssuerOptions`, capture `const facilityId = options.facilityId;` in `createIssuer`, and add to the `issue()` envelope after `issuerTier`:

```typescript
        ...(facilityId === undefined ? {} : { facilityId }),
```

- [ ] **Step 4: Add reason code + enforce in credential layer**

In `packages/shared/src/reasonCodes.ts` add (L1 area):

```typescript
  // A credential is bound to a different facility than the one being queried (GS1).
  'CREDENTIAL_FACILITY_MISMATCH',
```

Add the row to `CLAUDE.md` (layer L1). In `packages/agents/src/credentialLayer.ts`, add `readonly expectedFacilityId?: string;` to `CredentialLayerInput`, and after the issuer-tier check add:

```typescript
  if (input.expectedFacilityId !== undefined && payload['facilityId'] !== input.expectedFacilityId) {
    return { ok: false, reason: 'CREDENTIAL_FACILITY_MISMATCH' };
  }
```

- [ ] **Step 5: Run tests + full suite**

Run: `npx vitest run packages/agents/test/facilityBinding.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 2 new tests PASS; full suite PASS; typecheck clean.

- [ ] **Step 6: Document + Commit**

Add `facilityId` row to `docs/credentials.md` common-fields (envelope, 選填). Commit:

```bash
git add -A
git commit -m "feat: facility binding (CREDENTIAL_FACILITY_MISMATCH) — prevents cross-line reuse (GS1)"
```

---

## Task 7: RBA 項目分類表（可憑證化 vs 須實地，應補）

**Files:**
- Create: `packages/agents/src/rbaItems.ts`
- Modify: `packages/shared/src/reasonCodes.ts`
- Modify: `packages/agents/src/index.ts`
- Test: `packages/agents/test/rbaItems.test.ts`

**Interfaces:**
- Produces: reason code `REQUIRES_ONSITE_AUDIT`；`RBA_ITEM_CLASSIFICATION: Record<string, 'CREDENTIAL_ANSWERABLE' | 'REQUIRES_ON_SITE'>`；`classifyRbaItem(item: string): 'CREDENTIAL_ANSWERABLE' | 'REQUIRES_ON_SITE' | 'UNKNOWN'`。當被問到 `REQUIRES_ON_SITE` 項目時，呼叫端可據此回 `REQUIRES_ONSITE_AUDIT` 而非泛用拒絕。

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agents/test/rbaItems.test.ts
import { describe, expect, test } from 'vitest';
import { classifyRbaItem } from '@eas/agents';

describe('RBA item classification (題06 Q3)', () => {
  test('working-hours limits are credential-answerable', () => {
    expect(classifyRbaItem('workingHoursWithinLimit')).toBe('CREDENTIAL_ANSWERABLE');
  });

  test('document custody is credential-answerable', () => {
    expect(classifyRbaItem('passportHeldByWorker')).toBe('CREDENTIAL_ANSWERABLE');
  });

  test('physical safety conditions require an on-site audit', () => {
    expect(classifyRbaItem('fireSafetyConditions')).toBe('REQUIRES_ON_SITE');
  });

  test('an unknown item is UNKNOWN, not silently answerable', () => {
    expect(classifyRbaItem('somethingNew')).toBe('UNKNOWN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agents/test/rbaItems.test.ts`
Expected: FAIL — `classifyRbaItem` not exported.

- [ ] **Step 3: Write the registry**

```typescript
// packages/agents/src/rbaItems.ts
/**
 * RBA item classification — 題06 Q3. Some audit items can be answered by a
 * boolean credential; others (physical safety, environmental conditions) cannot
 * and must stay on-site. Making this explicit lets an agent answer "this item
 * requires an on-site audit" specifically, rather than a generic refusal — which
 * is itself an honesty claim: the system knows what it cannot replace.
 */
export type RbaItemClass = 'CREDENTIAL_ANSWERABLE' | 'REQUIRES_ON_SITE';

export const RBA_ITEM_CLASSIFICATION: Record<string, RbaItemClass> = {
  // Answerable by the existing credentials.
  workingHoursWithinLimit: 'CREDENTIAL_ANSWERABLE',
  passportHeldByWorker: 'CREDENTIAL_ANSWERABLE',
  recruitmentFeeWithinLegalCap: 'CREDENTIAL_ANSWERABLE',
  contractNativeLanguageProvided: 'CREDENTIAL_ANSWERABLE',
  // Must remain on-site — a boolean credential cannot honestly stand in.
  fireSafetyConditions: 'REQUIRES_ON_SITE',
  dormitoryLivingConditions: 'REQUIRES_ON_SITE',
  machineGuardingSafety: 'REQUIRES_ON_SITE',
  hazardousChemicalHandling: 'REQUIRES_ON_SITE',
};

export function classifyRbaItem(item: string): RbaItemClass | 'UNKNOWN' {
  return RBA_ITEM_CLASSIFICATION[item] ?? 'UNKNOWN';
}
```

Add to `packages/agents/src/index.ts`:

```typescript
export { RBA_ITEM_CLASSIFICATION, classifyRbaItem } from './rbaItems.js';
export type { RbaItemClass } from './rbaItems.js';
```

Add reason code to `packages/shared/src/reasonCodes.ts` (L2 area) and `CLAUDE.md`:

```typescript
  // The queried RBA item cannot be answered by a credential — it needs an on-site audit.
  'REQUIRES_ONSITE_AUDIT',
```

- [ ] **Step 4: Run tests + full suite**

Run: `npx vitest run packages/agents/test/rbaItems.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 4 new tests PASS; full suite PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agents): RBA item classification (credential-answerable vs on-site) — 題06 Q3"
```

---

## Task 8: 命題對照更新（README + demo 展示簽發者層級）

**Files:**
- Modify: `README.md`
- Modify: `packages/web/src/demo/world.ts`
- Modify: `packages/web/src/views/ConsoleView.tsx`
- Test: `packages/web/test/world.test.ts`（新增一項）

**Interfaces:**
- Consumes: Task 1–7 全部。
- Produces: demo 世界的 SplitView 或 delegationState 中，暴露 bank/brand 憑證的 `issuerTier`，稽核台顯示層級徽章；README 新增「命題對照」表把 Q1（簽發者層級）、Q4（收據）、Q5（撤銷通知）、題05 Q3（申辦偵測）標為已補。

- [ ] **Step 1: Write the failing test**

```typescript
// add to packages/web/test/world.test.ts
  test('the demo world exposes the working-hours issuer tier for display', async () => {
    const world = await createDemoWorld();
    const split = await world.split();
    // The factory self-declares; a demo scenario can later show a third-party tier.
    expect(['SELF_DECLARED', 'THIRD_PARTY_VERIFIED', 'AUTHORITY_CERTIFIED']).toContain(
      split.brand.workingHoursIssuerTier,
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/web/test/world.test.ts`
Expected: FAIL — `workingHoursIssuerTier` undefined on `split.brand`.

- [ ] **Step 3: Expose the tier in the demo world**

In `packages/web/src/demo/world.ts`, give the factory a tier (keep it `SELF_DECLARED` to make the point that hours are self-declared unless third-party-verified), and add `workingHoursIssuerTier` to the brand side of `SplitView`. Concretely: the `factory` issuer is created with default tier; in the brand branch of `split()`, read the tier from a working-hours presentation's verified payload (or hold it as a constant from the issuer options) and include `workingHoursIssuerTier: 'SELF_DECLARED'` in the returned brand object. Add the field to the `SplitView.brand` type.

- [ ] **Step 4: Show a tier badge in the console**

In `packages/web/src/views/ConsoleView.tsx`, in the brand pane, render a small badge: `工時憑證來源：{split.brand.workingHoursIssuerTier === 'SELF_DECLARED' ? '工廠自我聲明（T1）' : '第三方驗證（T2+）'}`. Tone `pending` for T1, `ok` for T2+.

- [ ] **Step 5: Run tests + full suite + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build --workspace @eas/web`
Expected: full suite PASS; typecheck clean; static build succeeds.

- [ ] **Step 6: Update README 命題對照 + Commit**

Add a `## 命題對照（題目 05／06）` section to README with a table marking: 題06 Q1 簽發者層級 ✅、Q4 查驗收據 ✅、Q5 撤銷通知 ✅、GS1 產線綁定 ✅、Q3 項目分類 ✅、題05 Q3 申辦偵測 ✅；並註明 `RecruitmentFeeCredential` 費用判準仍待查證清單結論（紅線）。

```bash
git add -A
git commit -m "docs+web: prompt-conformance table and issuer-tier badge in console"
```

---

## Self-Review

**1. 規格覆蓋**

| 分析文件的必補／應補項 | 對應 Task | 備註 |
|---|---|---|
| 簽發者可信層級（題06 Q1） | Task 1 + 2 | envelope 欄位 + 門檻 |
| 恢復契約同意憑證 | — | **已存在，不需做**（Global Constraints 事實修正 1） |
| 簽章查驗收據（題06 Q4） | Task 3 | 可獨立驗簽 JWT |
| 撤銷時通知曾查驗者（題06 Q5 第三子項） | Task 4 | 反向索引 + 通知 |
| 多重申辦異常偵測（題05 Q3） | Task 5 | 匿名計數 + 風險旗標 |
| factoryId／產線綁定（GS1） | Task 6 | envelope + 比對 |
| 可憑證化項目分類（題06 Q3） | Task 7 | 分類表 + REQUIRES_ONSITE_AUDIT |
| 工時第三方驗證（題06 提示4） | Task 1（T2） | 由 issuerTier T2 涵蓋，Task 8 在 demo 顯示 |
| 命題對照更新 | Task 8 | README + demo 徽章 |

無遺漏；「恢復契約憑證」經核對現況為既有，明確排除。

**2. 佔位符掃描**：無 TBD／TODO。每個需要程式碼的步驟都給了完整可貼上的內容。Task 8 Step 3 描述了具體欄位與位置（demo 世界的 SplitView.brand 加 `workingHoursIssuerTier`），非佔位。

**3. 型別一致性**：`IssuerTier` 的三個字面量在 Task 1／2／6／8 一致；`ISSUER_TIER_BELOW_THRESHOLD`／`CREDENTIAL_FACILITY_MISMATCH`／`REQUIRES_ONSITE_AUDIT` 三個新原因碼各只在其 Task 新增一次；`VerificationReceipt` 的欄位在 Task 3 定義、Task 4 消費，欄位名一致（`subjectCredentialHash`、`verifierDid`、`verifiedItems`、`result`、`verifiedAt`）；`BankAssessment.riskFlags`（Task 5）為新增選填陣列，不破壞既有 `bankAgent.test.ts`。

**4. 紅線遵守**：`issuerTier`／`facilityId` 皆為 envelope 欄位（與 iss/iat/vct/exp 同層），不進任何 disclosure schema，不動 `RecruitmentFeeCredential` 的 `feeWithinLegalCap` 判準或 M7 交叉驗證論述。Task 7 的分類表列了 `recruitmentFeeWithinLegalCap` 為「可憑證化」，那是**分類標記**，不改任何費用判準邏輯。

**5. 已知風險**

| 風險 | 緩解 |
|---|---|
| 新增 envelope 欄位改變 `credentialHash`（雙簽配對雜湊） | 雜湊涵蓋整個 issuer-signed 段，欄位變動一致地反映在簽發與驗證兩側，配對仍成立；既有 T4 篡改測試會捕捉任何不一致 |
| `BankAssessment` 加 `riskFlags` 破壞既有測試 | 既有 `bankAgent.test.ts` 只斷言 recommendation/reasons/requiresHumanReview 與 `Object.keys(agent)===['assess']`；新增欄位與選填第二參數不破壞這些 |
| delegation.ts 的 inline import 型別寫法笨拙 | Task 2 Step 4 提供替代：頂部 `import type { IssuerTier }` |
