import { useCallback, useEffect, useState } from 'react';
import { api, type DemoPayload } from './api.js';
import { WalletView } from './views/WalletView.js';
import { ConsoleView } from './views/ConsoleView.js';
import { AttackIntegrityView } from './views/AttackIntegrityView.js';

type Tab = 'wallet' | 'console' | 'attack';

export function App(): JSX.Element {
  const [payload, setPayload] = useState<DemoPayload | null>(null);
  const [tab, setTab] = useState<Tab>('wallet');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.state().then(setPayload);
  }, []);

  const run = useCallback(async (action: () => Promise<DemoPayload>) => {
    setBusy(true);
    try {
      setPayload(await action());
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1>
            <span>Evidence at Source</span>
            證據前置
          </h1>
          <p>
            關於勞工的事實由勞工本人持有，在事件發生當下就簽章封存。
            銀行與品牌的查驗 Agent 只能問到答案，拿不到資料。
          </p>
        </div>
        <nav className="tabs">
          <button data-active={tab === 'wallet'} onClick={() => setTab('wallet')}>
            勞工錢包
          </button>
          <button data-active={tab === 'console'} onClick={() => setTab('console')}>
            稽核台
          </button>
          <button data-active={tab === 'attack'} onClick={() => setTab('attack')}>
            攻防與完整性
          </button>
        </nav>
      </header>

      {payload === null ? (
        <p className="loading">正在簽發合成憑證…</p>
      ) : tab === 'wallet' ? (
        <WalletView
          snapshot={payload.snapshot}
          walletReview={payload.delegation.walletReview}
          busy={busy}
          onAttest={(type) => void run(() => api.attest(type))}
          onAttestAll={() => void run(api.attestAll)}
          onReset={() => void run(api.reset)}
        />
      ) : tab === 'console' ? (
        <ConsoleView
          snapshot={payload.snapshot}
          split={payload.split}
          agents={payload.delegation.agents}
          busy={busy}
          onRevoke={() => void run(api.revoke)}
          onRevokeAgent={(role) => void run(() => api.revokeAgent(role))}
          onReset={() => void run(api.reset)}
        />
      ) : (
        <AttackIntegrityView
          attack={payload.attack}
          integrity={payload.integrity}
          busy={busy}
          onReset={() => void run(api.reset)}
        />
      )}
    </div>
  );
}
