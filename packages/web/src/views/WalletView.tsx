import { useState } from 'react';
import type { AllowedQueryType } from '@eas/shared';
import type { DemoSnapshot } from '../demo/world.js';
import type { WalletDelegationView } from '../wallet/reviewDelegation.js';

interface Props {
  readonly snapshot: DemoSnapshot;
  readonly walletReview: WalletDelegationView;
  readonly busy: boolean;
  readonly onAttest: (type: string) => void;
  readonly onAttestAll: () => void;
  readonly onReset: () => void;
}

const CREDENTIAL_LABELS: Record<string, string> = {
  RecruitmentFeeCredential: '仲介費憑證',
  DocumentCustodyCredential: '證件保管憑證',
  ContractConsentCredential: '契約同意憑證',
  WorkingHoursCredential: '工時憑證',
};

const REFUSAL_LABELS: Record<string, string> = {
  AGENT_DELEGATION_MISSING: '此 Agent 未持有任何授權憑證',
  AGENT_DELEGATION_INVALID: '此 Agent 的授權簽章無效或非由已知機構簽發',
  AGENT_DELEGATION_EXPIRED: '此 Agent 的授權已過期',
  AGENT_DELEGATION_REVOKED: '此 Agent 的授權已被機構撤銷',
};

function describeQueryTypes(types: readonly AllowedQueryType[]): string {
  const parts: string[] = [];
  if (types.includes('boolean')) parts.push('布林結論');
  if (types.includes('aggregate')) parts.push('匯總比率');
  return `僅${parts.join('、')}（不含任何數字或明細）`;
}

function describeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `剩餘 ${hours} 小時 ${minutes} 分`;
}

function formatExpiry(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DelegationCard({ review }: { review: WalletDelegationView }): JSX.Element {
  const [decision, setDecision] = useState<'none' | 'allowed' | 'refused'>('none');

  if (review.status === 'refused') {
    return (
      <article className="card" data-state="revoked" style={{ marginBottom: '1.6rem' }}>
        <h3>查驗 Agent 請求查看你的憑證</h3>
        <p className="verdict" data-tone="bad">
          拒絕出示
        </p>
        <p className="note">
          {REFUSAL_LABELS[review.reason] ?? review.reason}。錢包不提供出示按鈕——
          在確認 Agent 有正當授權之前，你的任何憑證都不會被讀取。
        </p>
        <ul className="reason-list">
          <li>{review.reason}</li>
        </ul>
      </article>
    );
  }

  const scopeLabels = review.scope.map((t) => CREDENTIAL_LABELS[t] ?? t).join('、');

  return (
    <article className="card" data-state="pending" style={{ marginBottom: '1.6rem' }}>
      <h3>{review.principalName}的查驗 Agent 請求查看你的憑證</h3>

      <div style={{ marginTop: '1rem' }}>
        <div className="claim-row">
          <span className="name">授權方</span>
          <span className="value">{review.principalName}（{review.principal}）</span>
        </div>
        <div className="claim-row">
          <span className="name">授權目的</span>
          <span className="value">{review.purpose}</span>
        </div>
        <div className="claim-row">
          <span className="name">可查詢</span>
          <span className="value">{describeQueryTypes(review.allowedQueryTypes)}</span>
        </div>
        <div className="claim-row">
          <span className="name">查驗範圍</span>
          <span className="value">{scopeLabels}</span>
        </div>
        <div className="claim-row">
          <span className="name">授權到期</span>
          <span className="value">
            {formatExpiry(review.expiresAt)}（{describeRemaining(review.remainingSeconds)}）
          </span>
        </div>
      </div>

      <div style={{ marginTop: '1.3rem', display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
        {decision === 'none' ? (
          <>
            <button className="act" onClick={() => setDecision('allowed')}>
              允許本次出示
            </button>
            <button className="act" data-danger="true" onClick={() => setDecision('refused')}>
              拒絕
            </button>
          </>
        ) : (
          <span className="badge" data-tone={decision === 'allowed' ? 'ok' : 'bad'}>
            {decision === 'allowed' ? '已允許本次出示' : '已拒絕出示'}
          </span>
        )}
      </div>
    </article>
  );
}

export function WalletView({
  snapshot,
  walletReview,
  busy,
  onAttest,
  onAttestAll,
  onReset,
}: Props): JSX.Element {
  const pending = snapshot.credentials.filter((c) => !c.attested).length;
  const inScope = new Map(
    walletReview.status === 'authorized'
      ? walletReview.credentialsInScope.map((c) => [c.type, c.inScope])
      : [],
  );

  return (
    <section>
      <DelegationCard review={walletReview} />

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
        {snapshot.credentials.map((credential, index) => {
          const outOfScope = inScope.get(credential.type) === false;

          return (
            <article
              key={credential.type}
              className="card"
              data-state={
                snapshot.subjectRevoked ? 'revoked' : credential.attested ? 'attested' : 'pending'
              }
              style={{ animationDelay: `${index * 60}ms`, opacity: outOfScope ? 0.55 : 1 }}
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
                {outOfScope ? (
                  <span className="badge" data-tone="pending">
                    不在此次授權範圍
                  </span>
                ) : credential.attested ? (
                  <span className="badge" data-tone="ok">
                    已反簽封存
                  </span>
                ) : (
                  <>
                    <span className="badge" data-tone="pending">
                      待勞工反簽
                    </span>
                    <button className="act" onClick={() => onAttest(credential.type)} disabled={busy}>
                      反簽
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="footnote">
        出示之前，錢包先驗證 Agent 自己的授權憑證，並把授權範圍攤開給勞工看——
        <strong>上限由機構給（Agent 只能做授權允許的事），下限由勞工給（勞工看到範圍後才決定出示）</strong>。
        授權無效、過期或已撤銷時，錢包直接不提供出示按鈕。斜線區塊代表該欄位在出示內容中
        <strong>密碼學上不存在</strong>，不是被遮蔽。
      </p>
    </section>
  );
}
