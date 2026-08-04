import type { VleiState } from '../demo/world.js';

interface Props {
  readonly vlei: VleiState;
  readonly busy: boolean;
  readonly onRevokeQvi: () => void;
}

const TIER_LABELS: Record<string, string> = {
  root: '信任根',
  qvi: '合格簽發機構',
  legalEntity: '法人 vLEI',
  agent: 'Agent 授權角色',
};

const FAILURE_LABELS: Record<string, string> = {
  REGISTRY_REVOKED: '鏈上有憑證已被撤銷',
  ROOT_UNTRUSTED: '信任根不在信任清單',
  SAID_MISMATCH: '憑證內容遭竄改',
  SIGNATURE_INVALID: '簽章驗證失敗',
  ROLE_MISMATCH: '授權角色不符',
  LEI_MISMATCH: 'LEI 不一致',
};

function ChevronRight(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ShieldIcon({ broken }: { broken: boolean }): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ verticalAlign: '-0.15em' }}
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      {broken ? <path d="m14.5 9.5-5 5m0-5 5 5" /> : <path d="m9 12 2 2 4-4" />}
    </svg>
  );
}

export function TrustChainPanel({ vlei, busy, onRevokeQvi }: Props): JSX.Element {
  const intact = vlei.chains.every((chain) => chain.verified);

  return (
    <section className="chain-panel" data-broken={!intact}>
      <div className="chain-head">
        <div>
          <h2>機構信任鏈</h2>
          <p className="who">vLEI · GLEIF → QVI → Legal Entity → ECR</p>
        </div>
        <span className="badge" data-tone={intact ? 'ok' : 'bad'}>
          <ShieldIcon broken={!intact} /> {intact ? '信任鏈完好' : 'QVI 已被 GLEIF 撤銷'}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="act"
          data-danger="true"
          onClick={onRevokeQvi}
          disabled={busy || vlei.qviRevoked}
        >
          模擬：GLEIF 撤銷 QVI 資格
        </button>
      </div>

      {vlei.chains.map((chain) => (
        <div className="chain-row" key={chain.role} role="group" aria-label={`${chain.role} 信任鏈`}>
          {chain.nodes.map((node, index) => (
            <div style={{ display: 'contents' }} key={node.tier}>
              {index > 0 && (
                <span className="chain-link" data-ok={chain.verified} aria-hidden="true">
                  <ChevronRight />
                </span>
              )}
              <div className="chain-node" data-ok={chain.verified}>
                <span className="tier">{TIER_LABELS[node.tier]}</span>
                <span className="title">{node.title}</span>
                <span className="sub">{node.subtitle}</span>
              </div>
            </div>
          ))}
          <span
            className="badge chain-verdict"
            data-tone={chain.verified ? 'ok' : 'bad'}
          >
            {chain.verified
              ? '鏈驗證通過'
              : `${FAILURE_LABELS[chain.failure ?? ''] ?? '鏈驗證失敗'} · ${chain.failure}`}
          </span>
        </div>
      ))}

      <div className="chain-issuers">
        <span className="chain-issuers-label">簽發方法人憑證</span>
        {vlei.issuers.map((issuer) => (
          <span className="chain-issuer" data-ok={issuer.verified} key={issuer.didWeb}>
            <ShieldIcon broken={!issuer.verified} />
            <span>{issuer.name}</span>
            <span className="lei">LEI {issuer.lei}</span>
          </span>
        ))}
      </div>

      <p className="note" style={{ maxWidth: '78ch' }}>
        機構信任不是設定檔裡的公鑰名單，而是一條可驗證的憑證鏈：Agent 的每一次查詢，
        L0 都會把這條鏈重新走一遍——SAID、簽章、撤銷狀態、LEI 一致性。
        上游任何一張憑證被撤銷，下游全部<strong>立即</strong>失效，沒有名單要同步。
      </p>
    </section>
  );
}
