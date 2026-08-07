import type {
  AgentAuthStatus,
  AgentRole,
  AuditEntry,
  DemoSnapshot,
  SplitView,
  VleiState,
  GovernanceState,
  IdentityState,
  ZkProofResult,
} from '../demo/world.js';
import { TrustChainPanel } from './TrustChainPanel.js';

interface Props {
  readonly snapshot: DemoSnapshot;
  readonly split: SplitView;
  readonly agents: readonly AgentAuthStatus[];
  readonly vlei: VleiState;
  readonly audit: readonly AuditEntry[];
  readonly rbaItems: readonly { readonly item: string; readonly verdict: string }[];
  readonly receipts: readonly {
    readonly verifierDid: string;
    readonly verifiedItems: readonly string[];
    readonly result: 'PASS' | 'FAIL';
    readonly verifiedAt: string;
    readonly independentlyVerified: boolean;
  }[];
  readonly revocationNotices: readonly {
    readonly verifierDid: string;
    readonly subjectCredentialHash: string;
  }[];
  readonly identity: IdentityState;
  readonly governance: GovernanceState;
  readonly onRevokeAuditor: () => void;
  readonly onRevokeReviewer: () => void;
  readonly onAttemptBrokerWallet: () => void;
  readonly presence: string | null;
  readonly onVerifyDevice: () => void;
  readonly zk: ZkProofResult | null;
  readonly zkBusy: boolean;
  readonly onProveZk: () => void;
  readonly busy: boolean;
  readonly onRevoke: () => void;
  readonly onRevokeAgent: (role: AgentRole) => void;
  readonly onRevokeQvi: () => void;
  readonly onExportBundle: (role: AgentRole) => Promise<string>;
  readonly onReset: () => void;
}

function describeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `剩餘 ${hours} 小時 ${minutes} 分`;
}

function AgentAuthBar({
  agent,
  busy,
  onRevokeAgent,
}: {
  agent: AgentAuthStatus | undefined;
  busy: boolean;
  onRevokeAgent: (role: AgentRole) => void;
}): JSX.Element | null {
  if (agent === undefined) return null;

  const tone = agent.status === 'valid' ? 'ok' : 'bad';
  const label =
    agent.status === 'valid'
      ? `授權有效 · ${describeRemaining(agent.remainingSeconds)}`
      : agent.status === 'revoked'
        ? '授權已被機構撤銷'
        : agent.status === 'expired'
          ? '授權已過期'
          : '授權無效';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.7rem',
        marginBottom: '1.2rem',
        flexWrap: 'wrap',
      }}
    >
      <span className="badge" data-tone={tone}>
        L0 授權：{label}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text-faint)' }}>
        {agent.principalName} → {agent.agentDid}
      </span>
      <span style={{ flex: 1 }} />
      <button
        className="act"
        data-danger="true"
        onClick={() => onRevokeAgent(agent.role)}
        disabled={busy || agent.status === 'revoked'}
      >
        模擬：機構撤銷此 Agent 授權
      </button>
    </div>
  );
}

const DELEGATION_REASONS = new Set([
  'AGENT_DELEGATION_MISSING',
  'AGENT_DELEGATION_INVALID',
  'AGENT_DELEGATION_EXPIRED',
  'AGENT_DELEGATION_REVOKED',
  'AGENT_VLEI_MISSING',
  'AGENT_VLEI_CHAIN_INVALID',
  'AGENT_VLEI_REVOKED',
  'AGENT_VLEI_BINDING_MISMATCH',
  'QUERY_TYPE_NOT_IN_SCOPE',
  'CREDENTIAL_TYPE_NOT_IN_SCOPE',
]);

export function ConsoleView({
  snapshot,
  split,
  agents,
  vlei,
  audit,
  rbaItems,
  receipts,
  revocationNotices,
  identity,
  governance,
  onRevokeAuditor,
  onRevokeReviewer,
  onAttemptBrokerWallet,
  presence,
  onVerifyDevice,
  zk,
  zkBusy,
  onProveZk,
  busy,
  onRevoke,
  onRevokeAgent,
  onRevokeQvi,
  onExportBundle,
  onReset,
}: Props): JSX.Element {
  const bankRefused = split.bank.refusedWith !== null;
  const bankRefusedAtL0 = bankRefused && DELEGATION_REASONS.has(split.bank.refusedWith as string);
  const brandAnswer = split.brand.answer;
  const brandRefusedAtL0 = split.brand.refusedWith !== null;
  const bankAgent = agents.find((a) => a.role === 'bank');
  const brandAgent = agents.find((a) => a.role === 'brand');

  return (
    <section>
      <p className="view-intro">
        你現在是<strong>查驗方</strong>。左邊是銀行的 AI Agent、右邊是品牌的 AI
        Agent——對同一批憑證，它們只拿得到「是／否」和比率，
        <strong>拿不到任何原始數字</strong>。可以按紅色的「模擬」按鈕看撤銷當下會發生什麼。
      </p>

      <TrustChainPanel
        vlei={vlei}
        busy={busy}
        onRevokeQvi={onRevokeQvi}
        onExportBundle={onExportBundle}
      />

      <div className="toolbar">
        <span className="badge" data-tone={snapshot.subjectRevoked ? 'bad' : 'ok'}>
          {snapshot.subjectRevoked ? '主體已撤銷' : `母體 ${snapshot.cohortSize} 人`}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="act"
          data-danger="true"
          onClick={onRevoke}
          disabled={busy || snapshot.subjectRevoked}
        >
          模擬離境：撤銷主體
        </button>
        <button className="act" onClick={onReset} disabled={busy}>
          重置
        </button>
      </div>

      <div className="split">
        <div className="split-pane">
          <h2>建議核准，待人類覆核</h2>
          <p className="who">Agent A ／ 代表銀行</p>

          <AgentAuthBar agent={bankAgent} busy={busy} onRevokeAgent={onRevokeAgent} />

          {bankRefused ? (
            <>
              <p className="verdict" data-tone="bad">
                拒絕
              </p>
              <ul className="reason-list">
                <li>{split.bank.refusedWith}</li>
              </ul>
              <p className="note">
                {bankRefusedAtL0
                  ? 'L0 授權層就攔下了，Agent 一個勞工欄位都沒讀到——未授權就讀不到。'
                  : '閘門在憑證層就攔下了，Agent 沒有讀到任何欄位。'}
              </p>
            </>
          ) : (
            <>
              <p
                className="verdict"
                data-tone={split.bank.assessment?.reasons.length === 0 ? 'ok' : 'bad'}
              >
                {split.bank.assessment?.recommendation === 'APPROVE_PENDING_HUMAN_REVIEW'
                  ? '建議核准'
                  : '建議婉拒'}
              </p>
              <p className="note">此為建議，不是決定。最終仍需人類覆核。</p>

              <div style={{ marginTop: '1.4rem' }}>
                {Object.entries(split.bank.disclosed).map(([key, value]) => (
                  <div className="claim-row" key={key}>
                    <span className="name">{key}</span>
                    <span className="value">{String(value)}</span>
                  </div>
                ))}
                <div className="claim-row">
                  <span className="name">feeAmount</span>
                  <span className="redacted" role="img" aria-label="此欄位未揭露" />
                </div>
                <div className="claim-row">
                  <span className="name">salaryAmount</span>
                  <span className="redacted" role="img" aria-label="此欄位未揭露" />
                </div>
              </div>

              {split.bank.assessment !== null && split.bank.assessment.reasons.length > 0 && (
                <ul className="reason-list">
                  {split.bank.assessment.reasons.map((reason, i) => (
                    <li key={`${reason}-${i}`}>{reason}</li>
                  ))}
                </ul>
              )}

              {split.bank.assessment !== null && split.bank.assessment.riskFlags.length > 0 && (
                <div
                  style={{
                    marginTop: '0.6rem',
                    padding: '0.5rem 0.7rem',
                    border: '1px solid var(--amber, #d59a3c)',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                  }}
                >
                  <strong>風險旗標：{split.bank.assessment.riskFlags.join('、')}</strong>
                  <div className="note" style={{ marginTop: '0.25rem' }}>
                    同一身分短期在多家機構申辦。旗標只提供人類覆核參考，Agent 不據此做任何決定，
                    也拿不到申辦去向。
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="split-divider">
          <span>同一份證據</span>
        </div>

        <div className="split-pane">
          <h2>合規：是／否</h2>
          <p className="who">Agent B ／ 代表品牌</p>

          <AgentAuthBar agent={brandAgent} busy={busy} onRevokeAgent={onRevokeAgent} />

          <div style={{ marginBottom: '1.2rem' }}>
            <span
              className="badge"
              data-tone={split.brand.workingHoursIssuerTier === 'SELF_DECLARED' ? 'pending' : 'ok'}
            >
              工時憑證來源：
              {split.brand.workingHoursIssuerTier === 'SELF_DECLARED'
                ? '工廠自我聲明（T1）'
                : '第三方驗證（T2+）'}
            </span>
          </div>

          {brandRefusedAtL0 || brandAnswer === null ? (
            <>
              <p className="verdict" data-tone="bad">
                拒絕
              </p>
              <ul className="reason-list">
                <li>{split.brand.refusedWith}</li>
              </ul>
              <p className="note">L0 授權層就攔下了，Agent 一個勞工欄位都沒讀到。</p>
            </>
          ) : brandAnswer.ok ? (
            <>
              <p className="verdict" data-tone={brandAnswer.compliant ? 'ok' : 'bad'}>
                {brandAnswer.compliant ? '全數合規' : '存在不合規'}
              </p>
              <div style={{ marginTop: '1.4rem' }}>
                <div className="claim-row">
                  <span className="name">workingHoursComplianceRate</span>
                  <span className="value">{(brandAnswer.rate * 100).toFixed(0)}%</span>
                </div>
                <div className="claim-row">
                  <span className="name">cohortSize</span>
                  <span className="value">{brandAnswer.cohortSize}</span>
                </div>
                <div className="claim-row">
                  <span className="name">哪幾位勞工超時</span>
                  <span className="redacted" role="img" aria-label="此欄位未揭露" />
                </div>
                <div className="claim-row">
                  <span className="name">totalHours</span>
                  <span className="redacted" role="img" aria-label="此欄位未揭露" />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="verdict" data-tone="bad">
                拒答
              </p>
              <ul className="reason-list">
                <li>{brandAnswer.reason}</li>
              </ul>
            </>
          )}

          {!brandRefusedAtL0 && (
            <p className="note" style={{ marginTop: '1.4rem' }}>
              個體查詢的回應：
              <br />
              <code style={{ fontFamily: 'var(--mono)', color: 'var(--rust)' }}>
                {split.brand.individualQuery?.ok === false
                  ? split.brand.individualQuery.reason
                  : 'UNEXPECTED'}
              </code>
            </p>
          )}

          {split.brand.rejected.length > 0 && (
            <ul className="reason-list">
              {split.brand.rejected.map((reason, i) => (
                <li key={`${reason}-${i}`}>母體中有 1 份證據被閘門剔除：{reason}</li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: '1.4rem' }}>
            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>RBA 項目：憑證能答的與不能答的</h3>
            <p className="note" style={{ margin: '0 0 0.5rem' }}>
              系統明說自己不能取代什麼。未列在分類表上的項目回 CLAIM_NOT_DISCLOSED，而不是默默作答。
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85rem' }}>
              {rbaItems.map((row) => (
                <li key={row.item}>
                  <code style={{ fontFamily: 'var(--mono)' }}>{row.item}</code> —{' '}
                  {row.verdict === 'CREDENTIAL_ANSWERABLE' ? '憑證可答' : row.verdict}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {audit.length > 0 && (
        <details className="audit-panel">
          <summary>稽核軌跡（{audit.length} 筆）——每次決策的層級、准駁與授權依據</summary>
          <ol className="audit-list">
            {audit.map((entry) => (
              <li key={entry.seq}>
                <span className="badge" data-tone={entry.decision === 'ALLOW' ? 'ok' : 'bad'}>
                  {entry.layer} {entry.decision}
                </span>{' '}
                #{entry.seq} · {entry.agentRole} · {entry.action}
                {entry.reason !== null && <> · {entry.reason}</>}
                {entry.basis.ecrSaid !== null && (
                  <span className="audit-basis"> · ECR {entry.basis.ecrSaid.slice(0, 12)}…</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      <div style={{ marginTop: '1.4rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>查驗收據（被質疑時可出示）</h3>
        {receipts.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            尚未產生——先執行一次 SplitDemo。
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85rem' }}>
            {receipts.map((r) => (
              <li key={r.verifiedAt}>
                {r.verifiedAt} · {r.verifierDid} 驗了{' '}
                <code style={{ fontFamily: 'var(--mono)' }}>{r.verifiedItems.join('、')}</code> ·{' '}
                {r.result}
                {r.independentlyVerified ? ' · 簽章可獨立驗證 ✅' : ' · 簽章驗證失敗 ❌'}
              </li>
            ))}
          </ul>
        )}
        <p className="note" style={{ margin: '0.4rem 0 0' }}>
          收據只含項目名稱與憑證雜湊，不含任何原始數值；持有查驗方公鑰的人都能獨立驗簽。
        </p>
      </div>

      <div style={{ marginTop: '1.4rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>撤銷反向通知名單</h3>
        {revocationNotices.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            尚無曾驗證者。
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85rem' }}>
            {revocationNotices.map((n) => (
              <li key={n.verifierDid}>{n.verifierDid}</li>
            ))}
          </ul>
        )}
        <p className="note" style={{ margin: '0.4rem 0 0' }}>
          這份憑證一旦被撤銷，上列每一個查驗方都會收到通知。名單由憑證雜湊反向索引產生，不含勞工識別碼。
        </p>
      </div>

      <div className="panel">
        <h3>治理鏈：資格、背書、紀錄、決策者，全部掛在同一條鏈上</h3>
        <p className="note" style={{ margin: '0 0 0.6rem' }}>
          機構身分可驗證只是第一步。下面四件事本來各自散落——有的是簽發者自己寫的欄位、
          有的是沒人驗的字串、有的根本沒有身分——現在<strong>全部由鏈決定，而且都可以被撤銷</strong>。
        </p>
        <div className="panel-rows">
          <div className="claim-row is-wide">
            <span className="name">工時簽發者的鏈上層級</span>
            <span className="value">
              {governance.workingHoursChainTier}
              <span className="qualifier">憑證敢報得比這高就 ISSUER_TIER_MISMATCH</span>
            </span>
          </div>
          <div className="claim-row is-wide">
            <span className="name">第三方稽核背書</span>
            <span className="value">
              {governance.auditor.legalName ?? '解析不到 → AUDITOR_CHAIN_INVALID'}
            </span>
          </div>
          <div className="claim-row is-wide">
            <span className="name">覆核者（按下核准的人）</span>
            <span className="value">
              {governance.reviewer.personLegalName === null
                ? '已離職 → 不能再核准'
                : `${governance.reviewer.personLegalName}／${governance.reviewer.officialRole}`}
            </span>
          </div>
          <div className="claim-row is-wide">
            <span className="name">稽核軌跡獨立重驗</span>
            <span className="value">
              {governance.auditIntegrity.ok
                ? `通過 ✅ · ${governance.auditIntegrity.verifiedEntries} 筆 · ${
                    governance.auditIntegrity.sealed ? '已封緘' : '未封緘'
                  }`
                : `失敗 ❌ ${governance.auditIntegrity.failure}`}
            </span>
          </div>
        </div>
        <p className="note" style={{ margin: '0.5rem 0 0' }}>
          最後一列不是「我們自己說有記」：它是拿<strong>銀行法人憑證公布的公鑰</strong>重新驗過每一筆
          封緘、並重算整條雜湊鏈的結果。改掉任何一筆舊決策、或抽掉中間一筆，這裡就會變紅。
        </p>
        <div className="panel-actions">
          <button
            className="act"
            data-danger="true"
            onClick={onRevokeAuditor}
            disabled={busy || governance.auditor.legalName === null}
          >
            模擬：稽核機構被除名
          </button>
          <button
            className="act"
            data-danger="true"
            onClick={onRevokeReviewer}
            disabled={busy || governance.reviewer.personLegalName === null}
          >
            模擬：覆核者離職
          </button>
        </div>
        <p className="note" style={{ margin: '0.5rem 0 0' }}>
          按下去不用重新設定任何名單——它們的失效是<strong>鏈的結果</strong>，不是誰去同步了什麼。
          稽核機構被除名，它背書過的每一張 T2 憑證同時降級；覆核者離職，
          他<strong>在職期間簽過的仍然成立</strong>，但不能再核准任何新案。
        </p>
      </div>

      <div className="panel">
        <h3>一人一憑證：仲介開不了第二個錢包</h3>
        <p className="note" style={{ margin: '0 0 0.6rem' }}>
          雙簽擋得住<strong>竄改紀錄的雇主</strong>，擋不住<strong>拿走手機的仲介</strong>——他手上有私鑰，
          每個簽章都是真的。所以身分要另外錨定：移民署簽發的在留憑證帶一個唯一性錨，
          同一個錨<strong>只能有一個 active 錢包</strong>。
        </p>
        <div className="panel-rows">
          <div className="claim-row is-wide">
            <span className="name">identityAnchor</span>
            <span className="value">{identity.identityAnchor}</span>
          </div>
          <div className="claim-row is-wide">
            <span className="name">綁定狀態</span>
            <span className="value">{identity.status}</span>
          </div>
          <div className="claim-row is-wide">
            <span className="name">此人歷來錢包數</span>
            <span className="value">{identity.bindingCount}</span>
          </div>
          <div className="claim-row is-wide">
            <span className="name">裝置在場驗證（FIDO）</span>
            <span className="value">
              {identity.webauthnAvailable ? '此瀏覽器支援 ✅' : '此瀏覽器不支援——閘門一律拒絕'}
            </span>
          </div>
        </div>
        <div className="panel-actions">
          <button className="act" data-danger="true" onClick={onAttemptBrokerWallet} disabled={busy}>
            模擬仲介：替同一人再開一個錢包
          </button>
          <button className="act" onClick={onVerifyDevice} disabled={busy}>
            用這台裝置的生物辨識驗證本人
          </button>
        </div>
        {presence !== null && (
          <p className="note" style={{ margin: '0.5rem 0 0' }}>
            {presence}
          </p>
        )}
        {identity.brokerAttempt !== null && (
          <p className="note" style={{ margin: '0.5rem 0 0' }}>
            被拒絕：<code>{identity.brokerAttempt}</code>
            ——註冊表沒有被改動，原本那個錢包仍然是唯一有效的那一個。
            裝置遺失後的正當換綁必須<strong>先撤銷再重綁</strong>，所以換綁一定留下計數，不會安靜地發生。
          </p>
        )}
      </div>

      <div style={{ marginTop: '1.4rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>
          零知識對帳：證明一致，但不交出任何數字
        </h3>
        <p className="note" style={{ margin: '0 0 0.6rem' }}>
          交叉對帳原本需要一個同時看得到工時與入帳明文的元件——那本身就是個可信第三方。
          按下按鈕，證明會<strong>在你這台瀏覽器裡產生</strong>：工時、加班、入帳金額都不離開這台裝置，
          品牌只收到下面那組公開訊號。
        </p>
        <button className="act" onClick={onProveZk} disabled={zkBusy}>
          {zkBusy ? '產生證明中…' : '在本機產生零知識證明'}
        </button>
        {zk !== null && zk.available && (
          <div style={{ marginTop: '0.7rem', fontSize: '0.85rem' }}>
            <div>
              結論：<strong>{zk.verdict}</strong> · 驗證{' '}
              {zk.verified ? '通過 ✅' : '失敗 ❌'} · 耗時 {zk.elapsedMs} ms
            </div>
            <p className="note is-tight">
              這個勾不是「數學算對了」而已。通過的是<strong>六項綁定檢查</strong>：證明本身有效、
              兩張憑證各自真實且未撤銷、雜湊與宣告相符、兩張屬於同一位勞工、
              <strong>電路打開的承諾就是這兩張憑證裡的承諾</strong>、以及回報的結論與電路輸出一致。
              少了倒數第二項，任何人都能用「別人的數字」配上「真的憑證」蒙混過關。
              {zk.bindingReason !== null && (
                <>
                  {' '}
                  本次未通過的是：
                  <code>{zk.bindingReason}</code>。
                </>
              )}
            </p>
            <div style={{ marginTop: '0.4rem' }}>品牌收到的全部內容（6 個公開訊號）：</div>
            <ol className="signal-list">
              {zk.publicSignals.map((sig, i) => (
                <li key={`${sig}-${i}`}>{sig}</li>
              ))}
            </ol>
            <p className="note" style={{ margin: '0.5rem 0 0' }}>
              第 1 個是結論，第 2、3 個是憑證裡的承諾，其餘是公開參數。
              186、42、38000 這三個數字不在其中——它們從未離開這台裝置。
            </p>
          </div>
        )}
        {zk !== null && !zk.available && (
          <p className="note" style={{ marginTop: '0.6rem' }}>
            證明後端不可用（{zk.reason}）。缺少後端一律視為未證明，絕不當作通過。
          </p>
        )}
      </div>

      <p className="footnote">
        每個 Agent 各自持有機構簽發的授權憑證（<strong>L0</strong>）。閘門順序是
        <strong> L0 → L1 → L2</strong>：先確認「查的人有沒有資格」，再驗「被查的資料是否成立」，
        最後才看「這個問題能不能問」。按下「機構撤銷此 Agent 授權」後，該 Agent 的查詢立即在 L0 失效，
        且勞工資料完全未被讀取——順序顛倒的話，未授權的 Agent 會在被拒絕前就先讀到勞工資料。
      </p>
    </section>
  );
}
