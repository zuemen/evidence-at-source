/**
 * The plain-language layer.
 *
 * The demo's audience is a judge with five minutes, not the engineer who wrote
 * the reason codes. Until now every view showed raw identifiers —
 * `zeroRecruitmentFeePaid`, `ATTESTATION_HASH_MISMATCH` — and asked the reader
 * to translate. The codes stay visible (they are the system's actual
 * vocabulary, and hiding them would undercut the "grep us" invitation), but
 * they stop being the only thing on screen.
 *
 * One module, because the failure mode of glossaries is drift: WalletView had
 * its own refusal labels, ConsoleView had none, and a third copy would have
 * followed.
 */

/** What each credential is, in the order a story tells it. */
export const CREDENTIAL_META: Record<string, { label: string; story: string }> = {
  RecruitmentFeeCredential: {
    label: '仲介費憑證',
    story: '證明「沒有被收取不當費用」——RBA 稽核最常出事的一項',
  },
  DocumentCustodyCredential: {
    label: '證件保管憑證',
    story: '證明護照與居留證在本人手上，不是被雇主或仲介收走',
  },
  ContractConsentCredential: {
    label: '契約同意憑證',
    story: '證明契約以母語確認過、本人知情簽署',
  },
  WorkingHoursCredential: {
    label: '工時憑證',
    story: '打卡當下簽發，不是稽核前一晚補做的表',
  },
};

/** Issuer DIDs are synthetic; the reader needs the role, not the string. */
export const ISSUER_GLOSS: Record<string, string> = {
  'did:web:agency.example': '仲介公司',
  'did:web:factory.example': '工廠（打卡系統）',
  'did:web:employer.example': '雇主',
  'did:web:bank.example': '銀行',
  'did:web:immigration.example': '移民署',
};

/**
 * Field names, glossed.
 *
 * The English identifier is the field's real name inside the SD-JWT and stays
 * on screen — a judge who greps the repo must find exactly what the page
 * shows. The gloss says what a true value means.
 */
export const FIELD_GLOSS: Record<string, string> = {
  // RecruitmentFeeCredential
  zeroRecruitmentFeePaid: '未支付任何仲介費',
  feesReimbursedByEmployer: '曾付費但雇主已償還',
  reimbursedWithin90Days: '於 90 天內償還（RBA 要求）',
  withinTaiwanLegalCap: '在台灣法定上限內',
  standardVersion: '依據的標準版本',
  feeAmount: '實際費用金額',
  paymentSchedule: '付款排程',
  lenderName: '借款方名稱',
  // DocumentCustodyCredential
  passportHeldByWorker: '護照由本人保管',
  custodyRequestedByWorker: '代管是本人主動要求',
  bilingualConsentProvided: '有雙語對照同意書',
  legalBasis: '法律依據',
  documentType: '文件種類',
  documentHash: '文件雜湊',
  custodyLocation: '保管地點',
  // ContractConsentCredential
  nativeLanguageVersionProvided: '有母語版本契約',
  language: '契約語言',
  consentTimestamp: '同意時間',
  salaryAmount: '約定薪資金額',
  contractDocumentHash: '契約文件雜湊',
  // WorkingHoursCredential
  withinRBALimit: '工時在 RBA 上限內',
  withinRBAWeeklyLimit: '週工時在 RBA 上限內',
  withinLocalMonthlyLimit: '月加班在台灣法定上限內',
  weeklyHoursLimit: '適用的週工時上限',
  overtimeVoluntary: '加班出於自願（勞工反簽才算數）',
  restDayCompliant: '每七日至少一日休息',
  periodStart: '統計期間起日',
  periodEnd: '統計期間迄日',
  valueCommitment: '數值承諾（供零知識對帳）',
  totalHours: '實際總工時',
  overtimeHours: '實際加班時數',
  commitmentSalt: '承諾鹽值',
  reportedHours: '勞工自述工時',
  // SalaryDepositCredential
  issuerType: '簽發機構類型',
  depositedAmountTWD: '實際入帳金額',
  depositCount: '入帳筆數',
  // console-side names
  workingHoursComplianceRate: '工時合規率',
  cohortSize: '母體人數',
};

/**
 * Reason codes, glossed. Every code the demo can put on screen has an entry;
 * a code without one renders bare, which the tests treat as a bug to file.
 */
export const REASON_GLOSS: Record<string, string> = {
  // L0 — the asking agent's own standing
  AGENT_DELEGATION_MISSING: 'Agent 未持有任何授權憑證',
  AGENT_DELEGATION_INVALID: '授權簽章與機構的 vLEI 公鑰不符',
  AGENT_DELEGATION_EXPIRED: '授權已過期',
  AGENT_DELEGATION_REVOKED: '授權已被機構撤銷',
  AGENT_VLEI_MISSING: '未出示 vLEI 授權鏈',
  AGENT_VLEI_CHAIN_INVALID: 'vLEI 信任鏈驗證失敗',
  AGENT_VLEI_REVOKED: '信任鏈上有憑證已被撤銷',
  AGENT_VLEI_BINDING_MISMATCH: '授權憑證與 vLEI 鏈指向不同的 Agent',
  QUERY_TYPE_NOT_IN_SCOPE: '這種查詢不在授權範圍內',
  CREDENTIAL_TYPE_NOT_IN_SCOPE: '這種憑證不在授權範圍內',
  // L1 — the evidence itself
  ATTESTATION_HASH_MISMATCH: '勞工反簽指向的內容與這份不符——有人事後改過',
  MISSING_WORKER_ATTESTATION: '缺少勞工反簽，單方簽發不算數',
  ATTESTATION_SUBJECT_MISMATCH: '反簽的人不是這張憑證的當事人',
  CREDENTIAL_REVOKED: '憑證已被撤銷',
  CREDENTIAL_EXPIRED: '憑證已過期',
  INVALID_ISSUER_SIGNATURE: '簽發方簽章無效',
  ISSUER_VLEI_REVOKED: '簽發方的 vLEI 鏈已被上游撤銷——整條連帶失效',
  ISSUER_VLEI_CHAIN_INVALID: '簽發方的 vLEI 鏈驗證失敗',
  ISSUER_TIER_MISMATCH: '自稱的可信層級高於鏈上授予的層級',
  ISSUER_TIER_BELOW_THRESHOLD: '簽發方層級低於查驗方要求',
  AUDITOR_CHAIN_INVALID: '背書機構已無法在鏈上驗證為稽核機構',
  CREDENTIAL_FACILITY_MISMATCH: '憑證屬於別的產線，不能挪用',
  CLAIM_NOT_DISCLOSED: '勞工未揭露此欄位',
  POLICY_CHECK_FAILED: '已揭露，但不符合規則',
  // identity binding
  IDENTITY_ALREADY_ENROLLED: '同一個人已有一個有效錢包——第二個開不了',
  WORKER_IDENTITY_UNBOUND: '錢包沒有綁定到任何在留身分',
  RESIDENCY_PERMIT_EXPIRED: '居留許可已過期',
  USER_PRESENCE_NOT_VERIFIED: '裝置沒有驗證到本人在場',
  DEVICE_CREDENTIAL_MISMATCH: '不是註冊時綁定的那台裝置',
  // L2 — the question itself
  INDIVIDUAL_QUERY_REJECTED: '指向個人的查詢，一律拒絕',
  AGGREGATE_BELOW_K_ANONYMITY: '母體太小，比率會洩漏個人',
  COHORT_TOO_SMALL: '母體低於底線，連是/否都不回答',
  DIFFERENCING_ATTACK_DETECTED: '兩次合法查詢相減即可鎖定個人——第二次被擋',
  QUERY_BUDGET_EXCEEDED: '查詢配額已用完',
  QUERY_REPLAY_DETECTED: '同一查詢在時間窗內重送',
  REQUIRES_ONSITE_AUDIT: '這一項憑證答不了，必須實地查核',
  STANDARD_NOT_IN_SCOPE: '此標準不在這個 Agent 的委任範圍',
  // audit trail & anchoring
  CHAIN_BROKEN: '有舊紀錄被改過——後面全部對不上',
  SEQUENCE_BROKEN: '中間有紀錄被抽掉',
  SEAL_INVALID: '封緘簽章無效',
  TAIL_TRUNCATED: '紀錄尾端被剪掉——被外部檢查點反證',
  ANCHOR_MISMATCH: '交出的紀錄與檢查點當時看到的不是同一份',
  // explanation guard
  CONTRADICTS_RECOMMENDATION: '文字推薦了與判定相反的結論',
  REVEALS_UNDISCLOSED_VALUE: '文字出現了沒人揭露過的數字',
  CLAIMS_FINAL_DECISION: '文字宣稱決定已做成——沒有人做過',
  // risk flags
  MULTIPLE_APPLICATIONS: '同一身分短期內多次申辦',
};

/** A field name with its meaning: gloss first, identifier kept underneath. */
export function Field({ name }: { name: string }): JSX.Element {
  const gloss = FIELD_GLOSS[name];
  if (gloss === undefined) return <span className="name">{name}</span>;

  return (
    <span className="name field-name">
      <span className="field-gloss">{gloss}</span>
      <code className="field-id">{name}</code>
    </span>
  );
}

/** A reason code with its meaning. The code stays greppable. */
export function Reason({ code }: { code: string }): JSX.Element {
  const gloss = REASON_GLOSS[code];

  return (
    <span className="reason">
      <code className="reason-code">{code}</code>
      {gloss !== undefined && <span className="reason-gloss">{gloss}</span>}
    </span>
  );
}

/**
 * A numbered act divider.
 *
 * The console used to be nine panels of equal weight; a first-time reader had
 * no way to know what order mattered. Acts give the page the same spine as
 * the pitch: who is asking → what they get → what happens when things break.
 */
export function Act({
  n,
  title,
  lead,
}: {
  n: number;
  title: string;
  lead: string;
}): JSX.Element {
  return (
    <div className="act-header">
      <span className="act-n" aria-hidden="true">
        {n}
      </span>
      <div>
        <h2 className="act-title">{title}</h2>
        <p className="act-lead">{lead}</p>
      </div>
    </div>
  );
}
