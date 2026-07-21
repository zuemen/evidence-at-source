import type { DemoSnapshot } from '../demo/world.js';

interface Props {
  readonly snapshot: DemoSnapshot;
  readonly busy: boolean;
  readonly onAttest: (type: string) => void;
  readonly onAttestAll: () => void;
  readonly onReset: () => void;
}

export function WalletView({ snapshot, busy, onAttest, onAttestAll, onReset }: Props): JSX.Element {
  const pending = snapshot.credentials.filter((c) => !c.attested).length;

  return (
    <section>
      <div className="toolbar">
        <span className="badge" data-tone={pending === 0 ? 'ok' : 'pending'}>
          {pending === 0 ? '四張皆已反簽' : `待反簽 ${pending} 張`}
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '0.72rem',
            color: 'var(--text-faint)',
            wordBreak: 'break-all',
          }}
        >
          {snapshot.workerDID}
        </span>
        <span style={{ flex: 1 }} />
        <button className="act" onClick={onAttestAll} disabled={busy || pending === 0}>
          全部反簽
        </button>
        <button className="act" onClick={onReset} disabled={busy}>
          重置
        </button>
      </div>

      <div className="grid">
        {snapshot.credentials.map((credential, index) => (
          <article
            key={credential.type}
            className="card"
            data-state={
              snapshot.subjectRevoked ? 'revoked' : credential.attested ? 'attested' : 'pending'
            }
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <h3>{credential.type}</h3>
            <p className="issuer">{credential.issuer}</p>

            {credential.publicFields.map((field) => (
              <div className="claim-row" key={field}>
                <span className="name">{field}</span>
                <span className="value">
                  {field === credential.headlineClaim ? 'true' : '已揭露'}
                </span>
              </div>
            ))}

            {credential.hiddenFields.map((field) => (
              <div className="claim-row" key={field}>
                <span className="name">{field}</span>
                <span className="redacted" title="此欄位未揭露：密碼學上不在出示內容中" />
              </div>
            ))}

            <div style={{ marginTop: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              {credential.attested ? (
                <span className="badge" data-tone="ok">
                  已反簽封存
                </span>
              ) : (
                <>
                  <span className="badge" data-tone="pending">
                    待勞工反簽
                  </span>
                  <button
                    className="act"
                    onClick={() => onAttest(credential.type)}
                    disabled={busy}
                  >
                    反簽
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className="footnote">
        雇主單方簽發的憑證在這裡是<strong>不成立</strong>的——未經勞工反簽的憑證出示時會被閘門以{' '}
        <code>MISSING_WORKER_ATTESTATION</code> 拒絕。斜線區塊代表的不是「被遮蔽的值」，
        而是該欄位在出示內容中<strong>密碼學上不存在</strong>：驗證方的 payload 裡沒有這個 key。
      </p>
    </section>
  );
}
