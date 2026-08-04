import type {
  AgentAuthStatus,
  AgentRole,
  DemoSnapshot,
  SplitView,
  VleiState,
} from '../demo/world.js';
import { TrustChainPanel } from './TrustChainPanel.js';

interface Props {
  readonly snapshot: DemoSnapshot;
  readonly split: SplitView;
  readonly agents: readonly AgentAuthStatus[];
  readonly vlei: VleiState;
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
        </div>
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
