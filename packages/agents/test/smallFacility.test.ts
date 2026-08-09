/**
 * 小母體場域的兩條替代路徑。
 *
 * `docs/k-anonymity.md` 誠實地寫著：少於 5 人的產線，這套機制一律拒答，正確的答案是
 * 走實地稽核。那句話是對的，但它讓文件停在「我們幫不上忙」——而全球供應鏈的末端**大量
 * 都是這種規模**，等於承認整套方法在最需要它的地方不適用。
 *
 * 這個檔案測試的是：拒答不是唯一的誠實答案。有兩條路可以在不偽造匿名性的前提下仍然回答
 * 一些東西。
 *
 * **路徑一 跨場域匯總**：把同產業、同地區的小場域併成一個母體。品牌問得到「這個地區的
 * 小型成衣廠合規率」，問不到「這一家」——而且是**結構上**問不到，回應裡沒有場域欄位。
 *
 * **路徑二 稽核背書**：n < K_MIN 時不給統計，改給一份可追溯到 vLEI 鏈的實地稽核背書。
 * 它是關於**工廠**的判斷，不是從勞工憑證推導出來的統計——工廠不是這套系統要保護的對象。
 */
import { describe, expect, test } from 'vitest';
import { AUDITOR_ROLE, bootstrapEcosystem } from '@eas/vlei';
import { createVleiIssuer } from '@eas/issuer';
import {
  MIN_POOLED_FACILITIES,
  createAuditorDirectory,
  createBrandAgent,
  type FacilityEndorsement,
  type SmallFacilityCohort,
} from '@eas/agents';

const WINDOW = '2026-08';

/** A facility of `size` workers, all but `failing` of them compliant. */
function facility(
  name: string,
  size: number,
  failing = 0,
  overrides: Partial<SmallFacilityCohort> = {},
): SmallFacilityCohort {
  return {
    facility: name,
    industry: 'garment',
    region: 'north',
    window: WINDOW,
    conclusions: Array.from({ length: size }, (_, i) => i >= failing),
    ...overrides,
  };
}

/** Four small facilities: 24 workers in total, none of them large enough alone. */
const POOL: readonly SmallFacilityCohort[] = [
  facility('did:web:alpha.example', 6, 1),
  facility('did:web:bravo.example', 6),
  facility('did:web:charlie.example', 6),
  facility('did:web:delta.example', 6),
];

const agentWith = (facilities: readonly SmallFacilityCohort[]) =>
  createBrandAgent([], [], [], { smallFacilities: facilities });

describe('路徑一：跨場域匯總（4-a）', () => {
  test('four facilities too small alone become one cohort that clears the rate bar', () => {
    const answer = agentWith(POOL).getAggregatedSmallFacilityRate('garment', 'north', WINDOW);

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.pooledSize).toBe(24);
    expect(answer.facilityCount).toBe(4);
    expect(answer.rate).toBeCloseTo(23 / 24);
  });

  test('每一家單獨問都被拒——匯總沒有放寬任何門檻', () => {
    // The pool answers because 24 workers clear the bar, not because pooling
    // lowers it. A six-worker facility is refused exactly as it was before.
    const alone = agentWith([facility('did:web:alpha.example', 6, 1)]);

    const answer = alone.getAggregatedSmallFacilityRate('garment', 'north', WINDOW);

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    // The accurate code, not the dramatic one: six workers can support a
    // universal proposition, just not a rate. Reporting COHORT_TOO_SMALL here
    // would be a lie that happens to sound stricter.
    expect(answer.reason).toBe('AGGREGATE_BELOW_K_ANONYMITY');
  });

  test('the answer names no facility, structurally', () => {
    const answer = agentWith(POOL).getAggregatedSmallFacilityRate('garment', 'north', WINDOW);

    // Not "the field is blank" — the field does not exist. A caller cannot read
    // a facility out of this answer by accident or on purpose.
    const serialised = JSON.stringify(answer);
    for (const name of POOL) {
      expect(serialised).not.toContain(name.facility);
    }
    expect(serialised).not.toContain('"facility"');
  });

  test('回應明確標示不可歸屬到任一場域', () => {
    const answer = agentWith(POOL).getAggregatedSmallFacilityRate('garment', 'north', WINDOW);

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    // A reader of an audit log must not be able to mistake this for a
    // per-facility figure. The flag is a literal false in the type, so no code
    // path can produce a pooled rate that claims to be attributable.
    expect(answer.attributableToFacility).toBe(false);
  });

  test('a pool of two facilities is refused even when the worker count clears the bar', () => {
    // Two is not anonymity. A participant who knows their own numbers subtracts
    // them and recovers the other facility's exactly — the same argument that
    // makes k=2 useless for individuals, one level up.
    const two = agentWith([
      facility('did:web:alpha.example', 12, 1),
      facility('did:web:bravo.example', 12),
    ]);

    const answer = two.getAggregatedSmallFacilityRate('garment', 'north', WINDOW);

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.reason).toBe('POOL_TOO_FEW_FACILITIES');
  });

  test('MIN_POOLED_FACILITIES is at least three', () => {
    expect(MIN_POOLED_FACILITIES).toBeGreaterThanOrEqual(3);
  });

  test('facilities from another industry or region are not pooled in', () => {
    const mixed = agentWith([
      ...POOL,
      facility('did:web:echo.example', 6, 0, { industry: 'electronics' }),
      facility('did:web:foxtrot.example', 6, 0, { region: 'south' }),
      facility('did:web:golf.example', 6, 0, { window: '2026-09' }),
    ]);

    const answer = mixed.getAggregatedSmallFacilityRate('garment', 'north', WINDOW);

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    // Diluting a stratum with unrelated facilities would make the number mean
    // nothing while making it easier to publish — the wrong trade in both
    // directions.
    expect(answer.pooledSize).toBe(24);
    expect(answer.facilityCount).toBe(4);
  });

  test('an unknown stratum is refused with nothing said about it', () => {
    const answer = agentWith(POOL).getAggregatedSmallFacilityRate('mining', 'north', WINDOW);

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.reason).toBe('COHORT_TOO_SMALL');
  });

  test('一個場域退出後，第二次查詢會被差分守門擋下', () => {
    // The attack that belongs to pooling. August: four facilities. September:
    // the same stratum minus delta. Subtracting the two answers isolates
    // delta — the facility-level form of the attack the guard was built for.
    //
    // Facility-keyed record ids are what make it visible: the two pools differ
    // by delta's six workers, six is below k, and the second query is refused.
    const agent = agentWith([
      ...POOL,
      ...POOL.slice(0, 3).map((f) => ({ ...f, window: '2026-09' })),
      // Padding so September still clears the rate bar on its own — otherwise
      // the refusal below could be about size rather than about differencing.
      facility('did:web:hotel.example', 6, 0, { window: '2026-09' }),
      facility('did:web:india.example', 6, 0, { window: '2026-09' }),
    ]);

    const first = agent.getAggregatedSmallFacilityRate('garment', 'north', WINDOW);
    const second = agent.getAggregatedSmallFacilityRate('garment', 'north', '2026-09');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('DIFFERENCING_ATTACK_DETECTED');
  });

  test('成員完全相同的兩期查詢照常回答', () => {
    // The guard must not simply block every second question. An unchanged
    // stratum measured twice differs by nothing and is answered both times.
    const agent = agentWith([...POOL, ...POOL.map((f) => ({ ...f, window: '2026-09' }))]);

    expect(agent.getAggregatedSmallFacilityRate('garment', 'north', WINDOW).ok).toBe(true);
    expect(agent.getAggregatedSmallFacilityRate('garment', 'north', '2026-09').ok).toBe(true);
  });
});

const AUDITOR_DID = 'did:web:sgs.example';
const TINY_FACILITY = 'did:web:tiny.example';

async function auditWorld() {
  const eco = bootstrapEcosystem();
  const auditBody = await createVleiIssuer({
    didWeb: AUDITOR_DID,
    legalName: 'SGS 稽核（合成）',
    leiTag: 'SGSEXAMPLE',
    ecosystem: eco,
  });

  return {
    eco,
    auditors: createAuditorDirectory(eco.trust, [
      { did: AUDITOR_DID, presentation: auditBody.grantAgentEcr(AUDITOR_DID, AUDITOR_ROLE) },
    ]),
  };
}

const ENDORSEMENT: FacilityEndorsement = {
  facility: TINY_FACILITY,
  auditorDid: AUDITOR_DID,
  visitedOn: '2026-07-15',
  verdict: 'PASS',
  scope: ['workingHours', 'dormitoryLivingConditions'],
};

const ASOF = new Date('2026-08-09T00:00:00Z');

describe('路徑二：稽核背書取代統計（4-b）', () => {
  test('a three-worker facility gets an endorsement where a statistic is refused', async () => {
    const { auditors } = await auditWorld();
    const agent = createBrandAgent([], [], [], {
      auditors,
      endorsements: [ENDORSEMENT],
    });

    const answer = agent.getFacilityEndorsement(TINY_FACILITY, ASOF);

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.verdict).toBe('PASS');
    expect(answer.auditor.legalName).toContain('SGS');
    expect(answer.visitedOn).toBe('2026-07-15');
  });

  test('背書標示自己是時點稽核，不是持續查驗', async () => {
    const { auditors } = await auditWorld();
    const agent = createBrandAgent([], [], [], { auditors, endorsements: [ENDORSEMENT] });

    const answer = agent.getFacilityEndorsement(TINY_FACILITY, ASOF);

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    // This project's whole argument is that point-in-time audits are weak. The
    // fallback must not quietly present itself as the thing it criticises.
    expect(answer.basis).toBe('ON_SITE_AUDIT');
    expect(answer.pointInTime).toBe(true);
  });

  test('the endorsement carries no worker figure of any kind', async () => {
    const { auditors } = await auditWorld();
    const agent = createBrandAgent([], [], [], { auditors, endorsements: [ENDORSEMENT] });

    const serialised = JSON.stringify(agent.getFacilityEndorsement(TINY_FACILITY, ASOF));

    // If an endorsement could carry a headcount or a compliance rate it would be
    // a statistic wearing an auditor's badge, and the k-anonymity floor it
    // routes around would mean nothing.
    for (const field of ['rate', 'count', 'cohortSize', 'workers', 'conclusions']) {
      expect(serialised).not.toContain(`"${field}"`);
    }
  });

  test('an auditor that does not resolve through the chain is refused', async () => {
    const { eco } = await auditWorld();
    const agent = createBrandAgent([], [], [], {
      // An empty directory: the DID names an audit body nobody can vouch for.
      auditors: createAuditorDirectory(eco.trust, []),
      endorsements: [ENDORSEMENT],
    });

    const answer = agent.getFacilityEndorsement(TINY_FACILITY, ASOF);

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.reason).toBe('AUDITOR_CHAIN_INVALID');
  });

  test('an endorsement older than its validity window is refused, not aged', async () => {
    const { auditors } = await auditWorld();
    const agent = createBrandAgent([], [], [], {
      auditors,
      endorsements: [{ ...ENDORSEMENT, visitedOn: '2024-01-10' }],
    });

    const answer = agent.getFacilityEndorsement(TINY_FACILITY, ASOF);

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    // A two-year-old visit is not evidence about today, and "here it is, note
    // the date" puts the judgement on a reader who will not make it.
    expect(answer.reason).toBe('ENDORSEMENT_EXPIRED');
  });

  test('a facility with no endorsement is told so plainly', async () => {
    const { auditors } = await auditWorld();
    const agent = createBrandAgent([], [], [], { auditors, endorsements: [] });

    const answer = agent.getFacilityEndorsement(TINY_FACILITY, ASOF);

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.reason).toBe('ENDORSEMENT_MISSING');
  });

  test('無稽核目錄時一律拒絕，而不是視為通過', async () => {
    // fail-closed: a verifier that never configured a directory has verified
    // nothing, and nothing must not look like an endorsement.
    const agent = createBrandAgent([], [], [], { endorsements: [ENDORSEMENT] });

    const answer = agent.getFacilityEndorsement(TINY_FACILITY, ASOF);

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.reason).toBe('AUDITOR_CHAIN_INVALID');
  });

  test('a FAIL verdict is reported as readily as a PASS', async () => {
    const { auditors } = await auditWorld();
    const agent = createBrandAgent([], [], [], {
      auditors,
      endorsements: [{ ...ENDORSEMENT, verdict: 'FAIL' }],
    });

    const answer = agent.getFacilityEndorsement(TINY_FACILITY, ASOF);

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    // The verdict is about the employer, which is not the party this system
    // protects. Suppressing it would protect the factory, not the workers.
    expect(answer.verdict).toBe('FAIL');
  });
});
