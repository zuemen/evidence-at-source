import type { DemoSnapshot, SplitView } from '../demo/world.js';

interface Props {
  readonly snapshot: DemoSnapshot;
  readonly split: SplitView;
  readonly busy: boolean;
  readonly onRevoke: () => void;
  readonly onReset: () => void;
}

export function ConsoleView({ snapshot, split, busy, onRevoke, onReset }: Props): JSX.Element {
  const bankRefused = split.bank.refusedWith !== null;
  const brandAnswer = split.brand.answer;

  return (
    <section>
      <div className="toolbar">
        <span className="badge" data-tone={snapshot.subjectRevoked ? 'bad' : 'ok'}>
          {snapshot.subjectRevoked ? '主體已撤銷' : `母體 ${snapshot.cohortSize} 人`}
        </span>
        <span style={{ flex: 1 }} />
        <button className="act" data-danger="true" onClick={onRevoke} disabled={busy || snapshot.subjectRevoked}>
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

          {bankRefused ? (
            <>
              <p className="verdict" data-tone="bad">
                拒絕
              </p>
              <ul className="reason-list">
                <li>{split.bank.refusedWith}</li>
              </ul>
              <p className="note">
                閘門在憑證層就攔下了，Agent 沒有讀到任何欄位。
              </p>
            </>
          ) : (
            <>
              <p className="verdict" data-tone={split.bank.assessment?.reasons.length === 0 ? 'ok' : 'bad'}>
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
                  <span className="redacted" />
                </div>
                <div className="claim-row">
                  <span className="name">salaryAmount</span>
                  <span className="redacted" />
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

          {brandAnswer.ok ? (
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
                  <span className="redacted" />
                </div>
                <div className="claim-row">
                  <span className="name">totalHours</span>
                  <span className="redacted" />
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

          <p className="note" style={{ marginTop: '1.4rem' }}>
            個體查詢的回應：
            <br />
            <code style={{ fontFamily: 'var(--mono)', color: 'var(--rust)' }}>
              {split.brand.individualQuery.ok === false
                ? split.brand.individualQuery.reason
                : 'UNEXPECTED'}
            </code>
          </p>

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
        兩邊看的是<strong>同一位勞工的同一批憑證</strong>，拿到的卻是各自業務所需的最小答案。
        銀行拿不到實際仲介費金額，品牌拿不到任何一位勞工的工時，也問不出「哪幾個人超時」——
        個體查詢一律回 <code>INDIVIDUAL_QUERY_REJECTED</code>。
        按下「模擬離境」後，該勞工的所有憑證同時失效（<code>CREDENTIAL_REVOKED</code>），
        但母體中其他勞工的證據不受影響，品牌仍拿得到匯總答案。
      </p>
    </section>
  );
}
