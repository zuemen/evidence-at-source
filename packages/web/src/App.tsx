import { useCallback, useEffect, useState } from 'react';
import { api, type DemoPayload } from './api.js';
import { WalletView } from './views/WalletView.js';
import { ConsoleView } from './views/ConsoleView.js';
import { AttackIntegrityView } from './views/AttackIntegrityView.js';
import { DIRECTOR_BEATS, type DirectorAction } from './demo/directorScript.js';

type Tab = 'wallet' | 'console' | 'attack';

export function App(): JSX.Element {
  const [payload, setPayload] = useState<DemoPayload | null>(null);
  const [tab, setTab] = useState<Tab>('wallet');
  const [busy, setBusy] = useState(false);
  const [directorOn, setDirectorOn] = useState(false);
  const [beatIndex, setBeatIndex] = useState(0);

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

  const runActions = useCallback(async (actions: readonly DirectorAction[]): Promise<DemoPayload> => {
    let latest: DemoPayload | null = null;
    for (const action of actions) {
      if (action === 'reset') latest = await api.reset();
      else if (action === 'attestAll') latest = await api.attestAll();
      else if (action === 'revoke') latest = await api.revoke();
      else if (action === 'revokeAgentBank') latest = await api.revokeAgent('bank');
      else if (action === 'revokeQvi') latest = await api.revokeQvi();
    }
    return latest ?? (await api.state());
  }, []);

  const goToBeat = useCallback(
    async (index: number) => {
      const beat = DIRECTOR_BEATS[index];
      if (beat === undefined) return;
      setBusy(true);
      try {
        setPayload(await runActions(beat.actions));
        setTab(beat.tab);
        setBeatIndex(index);
      } finally {
        setBusy(false);
      }
    },
    [runActions],
  );

  const beat = DIRECTOR_BEATS[beatIndex];

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
          <button
            data-active={directorOn}
            onClick={() => {
              if (directorOn) {
                setDirectorOn(false);
              } else {
                setDirectorOn(true);
                void goToBeat(0);
              }
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              style={{ marginRight: '0.45em', verticalAlign: '-0.05em' }}
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            導演
          </button>
        </nav>
      </header>

      {directorOn && beat !== undefined && (
        <div className="director-bar">
          <div className="director-meta">
            <span className="director-step">
              幕 {beatIndex + 1} / {DIRECTOR_BEATS.length}
            </span>
            <strong className="director-title">{beat.title}</strong>
          </div>
          <p className="director-narration">{beat.narration}</p>
          <div className="director-controls">
            <button
              className="act"
              onClick={() => void goToBeat(beatIndex - 1)}
              disabled={busy || beatIndex === 0}
            >
              ← 上一幕
            </button>
            <div className="director-dots">
              {DIRECTOR_BEATS.map((b, i) => (
                <button
                  key={b.id}
                  className="director-dot"
                  data-active={i === beatIndex}
                  aria-label={b.title}
                  onClick={() => void goToBeat(i)}
                  disabled={busy}
                />
              ))}
            </div>
            <button
              className="act"
              onClick={() => void goToBeat(beatIndex + 1)}
              disabled={busy || beatIndex === DIRECTOR_BEATS.length - 1}
            >
              下一幕 →
            </button>
          </div>
        </div>
      )}

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
          vlei={payload.vlei}
          busy={busy}
          onRevoke={() => void run(api.revoke)}
          onRevokeAgent={(role) => void run(() => api.revokeAgent(role))}
          onRevokeQvi={() => void run(api.revokeQvi)}
          onExportBundle={(role) => api.exportBundle(role)}
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
