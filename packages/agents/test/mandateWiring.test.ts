/**
 * 授權憑證要真的驅動閘門，不是躺在那裡好看。
 *
 * 用 GLEIF 的方法論把論述從動作往回推之後，逼出了五個同一種形狀的落差：**檢查寫好了、
 * 也有測試，但沒有任何呼叫端把參數傳進去。** 一個永遠收不到參數的可選檢查，和一個不存在
 * 的檢查，對攻擊者來說完全一樣。
 *
 * 這個檔案鎖住其中三項——機構在授權憑證裡宣告的最低簽發層級、廠別綁定、第三方查核機構
 * 的解析——都改成沿著實際的呼叫路徑傳下去。
 */
import { describe, expect, test } from 'vitest';
import {
  createWorkerAttestation,
  generateKeyPair,
  presentCredential,
  type PublicJwk,
} from '@eas/shared';
import { AUDITOR_ROLE, bootstrapEcosystem } from '@eas/vlei';
import { createVleiIssuer } from '@eas/issuer';
import {
  buildCohortEvidence,
  createAuditorDirectory,
  requireIssuerSigningKey,
  type Submission,
} from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';
const AUDITOR_DID = 'did:web:sgs.example';

/** A factory that declares third-party backing, and the auditor it names. */
async function factoryWorld(options: Record<string, unknown> = {}) {
  const eco = bootstrapEcosystem();
  const auditBody = await createVleiIssuer({
    didWeb: AUDITOR_DID,
    legalName: 'SGS 稽核（合成）',
    leiTag: 'SGSEXAMPLE',
    ecosystem: eco,
  });
  const factory = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
    options: options as never,
  });

  return {
    eco,
    factory,
    factoryKey: requireIssuerSigningKey(factory.legalEntityPresentation(), eco.trust),
    auditors: createAuditorDirectory(eco.trust, [
      { did: AUDITOR_DID, presentation: auditBody.grantAgentEcr(AUDITOR_DID, AUDITOR_ROLE) },
    ]),
    emptyDirectory: createAuditorDirectory(eco.trust, []),
  };
}

async function submission(
  world: Awaited<ReturnType<typeof factoryWorld>>,
  claims: Record<string, unknown> = {},
): Promise<Submission> {
  const worker = await generateKeyPair();
  const credential = await world.factory.issue('WorkingHoursCredential', {
    workerDID: WORKER_DID,
    withinRBALimit: true,
    periodStart: '2026-08-01',
    totalHours: 186,
    overtimeHours: 42,
    ...claims,
  });

  return {
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
    attestation: await createWorkerAttestation(worker.privateKey, {
      workerDID: WORKER_DID,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-001',
    }),
    issuerPublicKey: world.factoryKey,
    workerPublicKey: worker.publicKey as PublicJwk,
  };
}

const base = (subs: readonly Submission[]) => ({
  cohort: 'factory-a-2026-08',
  metric: 'workingHoursComplianceRate' as const,
  claim: 'withinRBALimit',
  submissions: subs,
});

describe('最低簽發層級：機構宣告了，閘門就要照做', () => {
  test('a self-declared credential is refused when the mandate demands third-party backing', async () => {
    const world = await factoryWorld({ tier: 'SELF_DECLARED' });

    const { rejected, evidence } = await buildCohortEvidence({
      ...base([await submission(world)]),
      minimumIssuerTier: 'THIRD_PARTY_VERIFIED',
    });

    expect(rejected).toEqual(['ISSUER_TIER_BELOW_THRESHOLD']);
    expect(evidence.conclusions).toHaveLength(0);
  });

  test('the same credential is accepted when no minimum is demanded', async () => {
    // Proves the refusal above comes from the mandate and not a broken fixture.
    const world = await factoryWorld({ tier: 'SELF_DECLARED' });

    const { rejected } = await buildCohortEvidence(base([await submission(world)]));

    expect(rejected).toEqual([]);
  });
});

describe('廠別綁定：一家合格工廠的憑證不能替另一條產線作答', () => {
  test('a credential bound to another facility is refused', async () => {
    const world = await factoryWorld();

    const { rejected } = await buildCohortEvidence({
      ...base([await submission(world, { facilityId: 'gs1:4711' })]),
      expectedFacilityId: 'gs1:9999',
    });

    expect(rejected).toEqual(['CREDENTIAL_FACILITY_MISMATCH']);
  });

  test('the matching facility passes', async () => {
    const world = await factoryWorld();

    const { rejected, evidence } = await buildCohortEvidence({
      ...base([await submission(world, { facilityId: 'gs1:4711' })]),
      expectedFacilityId: 'gs1:4711',
    });

    expect(rejected).toEqual([]);
    expect(evidence.conclusions).toHaveLength(1);
  });
});

describe('第三方查核：匯總路徑也要解析 verifiedBy', () => {
  test('an unresolvable audit body is refused rather than believed', async () => {
    const world = await factoryWorld({ tier: 'THIRD_PARTY_VERIFIED', verifiedBy: AUDITOR_DID });

    const { rejected } = await buildCohortEvidence({
      ...base([await submission(world)]),
      auditors: world.emptyDirectory,
    });

    expect(rejected).toEqual(['AUDITOR_CHAIN_INVALID']);
  });

  test('a resolvable one passes', async () => {
    const world = await factoryWorld({ tier: 'THIRD_PARTY_VERIFIED', verifiedBy: AUDITOR_DID });

    const { rejected } = await buildCohortEvidence({
      ...base([await submission(world)]),
      auditors: world.auditors,
    });

    expect(rejected).toEqual([]);
  });
});
