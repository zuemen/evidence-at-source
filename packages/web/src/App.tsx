import { useCallback, useEffect, useState } from 'react';
import { api, type DemoPayload } from './api.js';
import { assertPresence, registerDevice } from './wallet/webauthn.js';
import { createRelyingPartyVerifier, type PublicJwk } from '@eas/shared';
import type { ZkProofResult } from './demo/world.js';
import { WalletView } from './views/WalletView.js';
import { ConsoleView } from './views/ConsoleView.js';
import { AttackIntegrityView } from './views/AttackIntegrityView.js';
import {
  DIRECTOR_BEATS,
  directorTranscript,
  type DirectorAction,
} from './demo/directorScript.js';

type Tab = 'wallet' | 'console' | 'attack';

export function App(): JSX.Element {
  const [payload, setPayload] = useState<DemoPayload | null>(null);
  const [tab, setTab] = useState<Tab>('wallet');
  const [busy, setBusy] = useState(false);
  const [directorOn, setDirectorOn] = useState(false);
  const [beatIndex, setBeatIndex] = useState(0);
  /**
   * The 90-second path. Fifteen beats are complete but nobody finishes them
   * on a first visit; three beats — seal, two answers, departure — tell the
   * whole arc. null = full tour; a list = essential tour indices into
   * DIRECTOR_BEATS.
   */
  const [beatList, setBeatList] = useState<readonly number[] | null>(null);
  /**
   * The landing moment. Five equally-weighted tabs told a first-time reader
   * nothing about where to start, so the page opens with one sentence and one
   * obvious button; it steps aside the moment a tour begins or the reader
   * says they would rather look around.
   */
  const [startCueOff, setStartCueOff] = useState(false);
  const [zk, setZk] = useState<ZkProofResult | null>(null);
  const [zkBusy, setZkBusy] = useState(false);
  const [presence, setPresence] = useState<string | null>(null);

  useEffect(() => {
    void api.state().then(setPayload);
    // Projection mode (?stage=1): the recording is watched from the back of a
    // room on the organiser's projector, not read at a desk. Type scales up
    // and page furniture that only matters to a seated reader steps aside.
    if (new URLSearchParams(window.location.search).has('stage')) {
      document.documentElement.setAttribute('data-stage', '1');
    }
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
      else if (action === 'attemptBrokerWallet') latest = await api.attemptBrokerWallet();
      else if (action === 'revokeAuditor') latest = await api.revokeAuditor();
      else if (action === 'revokeReviewer') latest = await api.revokeReviewer();
    }
    return latest ?? (await api.state());
  }, []);

  const goToBeat = useCallback(
    async (index: number, list: readonly number[] | null = beatList) => {
      const beat = DIRECTOR_BEATS[list === null ? index : (list[index] ?? -1)];
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
    [runActions, beatList],
  );

  const beatCount = beatList === null ? DIRECTOR_BEATS.length : beatList.length;
  const beat = DIRECTOR_BEATS[beatList === null ? beatIndex : (beatList[beatIndex] ?? -1)];

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
            data-active={directorOn && beatList !== null}
            data-tour-lite="true"
            onClick={() => {
              if (directorOn && beatList !== null) {
                setDirectorOn(false);
                setBeatList(null);
              } else {
                // Seal → two answers → departure: the arc in three beats.
                const essential = [1, 4, 12] as const;
                setBeatList(essential);
                setDirectorOn(true);
                void goToBeat(0, essential);
              }
            }}
          >
            精華 3 幕
          </button>
          <button
            data-active={directorOn && beatList === null}
            data-tour="true"
            onClick={() => {
              if (directorOn && beatList === null) {
                setDirectorOn(false);
              } else {
                setBeatList(null);
                setDirectorOn(true);
                void goToBeat(0, null);
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
            一鍵導覽
          </button>
        </nav>
      </header>

      {!directorOn && !startCueOff && (
        <div className="start-cue">
          <p className="start-cue-lead">
            這是一個<strong>可以自己按</strong>的展示：左邊是勞工的錢包，中間是銀行與品牌的查驗台，
            右邊是有人想造假時系統的反應。<strong>三個分頁都可以隨便點，不會壞。</strong>
          </p>
          <div className="start-cue-actions">
            <button
              className="start-cue-go"
              onClick={() => {
                const essential = [1, 4, 12] as const;
                setBeatList(essential);
                setDirectorOn(true);
                void goToBeat(0, essential);
              }}
            >
              沒時間的話，先看這 3 幕（約 60 秒）
            </button>
            <button className="start-cue-skip" onClick={() => setStartCueOff(true)}>
              我自己逛
            </button>
          </div>
        </div>
      )}

      {directorOn && beat !== undefined && (
        <div className="director-bar">
          <div className="director-meta">
            <span className="director-step">
              幕 {beatIndex + 1} / {beatCount}
              {beatList !== null && '（精華）'}
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
              {(beatList ?? DIRECTOR_BEATS.map((_, i) => i)).map((beatIdx, i) => (
                <button
                  key={DIRECTOR_BEATS[beatIdx]?.id ?? i}
                  className="director-dot"
                  data-active={i === beatIndex}
                  aria-label={DIRECTOR_BEATS[beatIdx]?.title ?? ''}
                  onClick={() => void goToBeat(i)}
                  disabled={busy}
                />
              ))}
            </div>
            <button
              className="act"
              onClick={() => void goToBeat(beatIndex + 1)}
              disabled={busy || beatIndex === beatCount - 1}
            >
              下一幕 →
            </button>
            <button
              className="act"
              onClick={() => {
                const blob = new Blob([directorTranscript()], {
                  type: 'text/plain;charset=utf-8',
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'evidence-at-source-逐字稿.txt';
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              下載逐字稿
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
          audit={payload.audit}
          rbaItems={payload.rbaItems}
          receipts={payload.receipts}
          revocationNotices={payload.revocationNotices}
          identity={payload.identity}
          governance={payload.governance}
          onVleiLab={(s) => api.vleiLab(s)}
          onRevokeAuditor={() => void run(api.revokeAuditor)}
          onRevokeReviewer={() => void run(api.revokeReviewer)}
          onAttemptBrokerWallet={() => void run(api.attemptBrokerWallet)}
          onTamperHours={() => void run(api.tamperWorkingHours)}
          presence={presence}
          onVerifyDevice={() => {
            setPresence('正在向這台裝置的驗證器請求生物辨識…');
            void (async () => {
              const device = await registerDevice(payload.identity.holderDid);
              if (device === null) {
                setPresence(
                  '這台裝置沒有可用的驗證器（或你取消了）。閘門因此拒絕——沒有在場證明就不算通過，' +
                    '這正是 fail-closed 的意思。',
                );
                return;
              }

              const challenge = crypto.getRandomValues(new Uint8Array(32));
              const assertion = await assertPresence(device.credentialId, challenge);
              if (assertion === null) {
                setPresence('驗證器沒有回應（或你取消了），閘門一律拒絕。');
                return;
              }

              if (device.publicKeyJwk === null) {
                setPresence(
                  '這個瀏覽器不交出憑證公鑰，驗證方就無從查驗簽章——閘門拒絕。' +
                    '「裝置說它驗過了」不是證據，能被別人重算的簽章才是。',
                );
                return;
              }

              // The check that used to be missing: the assertion is verified
              // against the key registered a moment ago, the challenge this
              // page issued, and this origin — not against the wallet's own
              // description of what the authenticator did.
              const verified = await createRelyingPartyVerifier({
                credentialPublicKey: device.publicKeyJwk as PublicJwk,
                rpId: window.location.hostname,
                expectedOrigin: window.location.origin,
                expectedChallenge: assertion.challenge,
              })(assertion);

              setPresence(
                verified
                  ? `驗證方已獨立驗過這張斷言的簽章：challenge 是本頁發的、origin 是本站、rpIdHash 相符、UV 旗標讀自 authenticatorData（credentialId 前綴 ${device.credentialId.slice(0, 12)}…）。私鑰留在安全元件裡，這個瀏覽器拿不到它。`
                  : '簽章沒有通過驗證方的查驗，閘門拒絕——這一步不看裝置怎麼說，只看它簽了什麼。',
              );
            })();
          }}
          zk={zk}
          zkBusy={zkBusy}
          onProveZk={() => {
            setZkBusy(true);
            void api
              .proveZk()
              .then(setZk)
              .finally(() => setZkBusy(false));
          }}
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

      {/*
        GPL-3.0 §4 requires license notices to survive distribution, and a web
        page is a distribution. This build bundles GPL-3.0 snarkjs and
        circomlibjs, so the notice belongs on the page itself — not only in a
        file a visitor never opens.
      */}
      <footer className="site-footer">
        <p>
          本專案原始碼依 <strong>MIT</strong> 授權；本網頁的建置產物包含{' '}
          <strong>GPL-3.0</strong> 授權之第三方元件（<code>snarkjs</code>、
          <code>circomlibjs</code>），其整體散布依 GPL-3.0。
        </p>
        <p>
          Source code is licensed <strong>MIT</strong>. This built page bundles
          third-party components under <strong>GPL-3.0</strong> (<code>snarkjs</code>,{' '}
          <code>circomlibjs</code>); distribution of the build as a whole is governed
          by GPL-3.0.{' '}
          <a
            href="https://github.com/zuemen/evidence-at-source/blob/main/THIRD-PARTY-LICENSES.md"
            target="_blank"
            rel="noreferrer"
          >
            THIRD-PARTY-LICENSES.md
          </a>
        </p>
      </footer>
    </div>
  );
}
