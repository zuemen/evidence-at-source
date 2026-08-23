import type { AttackDemoState, IntegrityDemoState } from '../demo/world.js';
import { Reason } from './gloss.js';

interface Props {
  readonly attack: AttackDemoState;
  readonly integrity: IntegrityDemoState;
  readonly busy: boolean;
  readonly onReset: () => void;
}

function ComponentBar({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div style={{ marginBottom: '0.7rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--mono)',
          fontSize: '0.74rem',
          color: 'var(--text-dim)',
          marginBottom: '0.3rem',
        }}
      >
        <span>{label}</span>
        <span className="value">{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: '6px', background: 'var(--paper-raised)', border: '1px solid var(--line)' }}>
        <div style={{ height: '100%', width: `${value * 100}%`, background: 'var(--jade)' }} />
      </div>
    </div>
  );
}

export function AttackIntegrityView({ attack, integrity, busy, onReset }: Props): JSX.Element {
  const gradeTone =
    integrity.grade === 'A' ? 'ok' : integrity.grade === 'D' ? 'bad' : 'pending';

  return (
    <section>
      <h2 className="sr-only">攻防與完整性</h2>

      <p className="view-intro">
        這一頁我們<strong>攻擊自己的系統</strong>，並展示為什麼擋得下來：
        往憑證裡塞惡意指令沒有用（判斷路徑上沒有 AI 可以被騙）、
        想用兩次查詢相減推算個人會被拒絕、證據的完整程度會被打成一個分數。
      </p>

      <div className="toolbar">
        <span className="badge" data-tone="ok">
          我們 demo 自己被攻擊，並擋下來
        </span>
        <span style={{ flex: 1 }} />
        <button className="act" onClick={onReset} disabled={busy}>
          重置
        </button>
      </div>

      <div className="grid">
        {/* T8 — prompt injection */}
        <article className="card" data-state="attested">
          <h3>T8 · Prompt Injection 無效</h3>
          <p className="issuer">憑證自由文字欄位注入指令</p>

          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '0.72rem',
              color: 'var(--rust)',
              background: 'var(--paper-raised)',
              border: '1px solid var(--line-bright)',
              padding: '0.7rem',
              margin: '0.6rem 0 1rem',
              wordBreak: 'break-word',
            }}
          >
            remark: &quot;{attack.t8.injectedRemark}&quot;
          </div>

          <div className="claim-row">
            <span className="name">閘門是否採納這張憑證</span>
            <span className="value">{attack.t8.accepted ? '是（注入是資料）' : '否'}</span>
          </div>
          <div className="claim-row">
            <span className="name">withinRBALimit（注入想改成 PASSED）</span>
            <span className="value" style={{ color: 'var(--rust)' }}>
              {String(attack.t8.withinRBALimit)}
            </span>
          </div>

          <p className="note" style={{ marginTop: '1rem' }}>
            注入想把不合規改成 PASSED，結果 <code>withinRBALimit</code> 仍是 <code>false</code>——
            <strong>判斷路徑上沒有任何 LLM</strong>，注入的是資料，不是指令。一個守門測試掃描所有原始碼、
            確認沒有檔案 import LLM client。
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '1.1rem 0' }} />

          <h3 style={{ fontSize: '0.95rem' }}>那如果模型真的讀到了呢？</h3>
          <p className="issuer">
            系統裡唯一允許模型存在的位置：把<strong>已經作成的判定</strong>寫成人話
          </p>

          <div className="claim-row">
            <span className="name">閘門的判定（模型不能更動）</span>
            <span className="value" style={{ color: 'var(--rust)' }}>
              {attack.t8.explain.recommendation}
            </span>
          </div>

          <p className="note" style={{ margin: '0.9rem 0 0.3rem' }}>
            <strong>① 模型在注入影響下寫出的草稿</strong>
          </p>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '0.72rem',
              color: 'var(--rust)',
              background: 'var(--paper-raised)',
              border: '1px dashed var(--rust)',
              padding: '0.7rem',
              wordBreak: 'break-word',
            }}
          >
            {attack.t8.explain.modelDraft}
          </div>

          <p className="note" style={{ margin: '0.9rem 0 0.3rem' }}>
            <strong>② 規則守衛抓到的違規</strong>（純規則，不呼叫模型）
          </p>
          <ul className="reason-list" style={{ margin: 0 }}>
            {attack.t8.explain.violations.map((v) => (
              <li key={v}>
                <Reason code={v} />
              </li>
            ))}
          </ul>

          <p className="note" style={{ margin: '0.9rem 0 0.3rem' }}>
            <strong>③ 覆核者實際看到的內容</strong>
            {attack.t8.explain.source === 'offline' ? '（草稿已丟棄，改用確定性樣板）' : ''}
          </p>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '0.72rem',
              color: 'var(--jade)',
              background: 'var(--paper-raised)',
              border: '1px solid var(--jade)',
              padding: '0.7rem',
              wordBreak: 'break-word',
            }}
          >
            {attack.t8.explain.shown}
          </div>

          <p className="note" style={{ marginTop: '1rem' }}>
            注入確實改變了模型寫的字——<strong>但改變不了送到人眼前的判定</strong>。
            守衛是純規則：會被同一個注入說服的守衛，等於沒有守衛。
          </p>
          <p className="note" style={{ marginTop: '0.5rem', opacity: 0.75 }}>
            誠實標註：①的模型輸出是<strong>預錄樣本</strong>——這個 demo 是靜態站、沒有 API key，
            也必須能在斷網的會場運作。②③是<strong>當場真的執行</strong>
            <code>checkExplanation</code> 與 <code>guardExplainer</code> 的結果。真實模型接線見
            <code>packages/explain/src/claude.ts</code>。
          </p>
        </article>

        {/* T9 — differencing attack */}
        <article className="card" data-state="pending">
          <h3>T9 · 差分攻擊被擋</h3>
          <p className="issuer">連續查詢，母體逐次縮小</p>

          <div style={{ marginTop: '0.6rem' }}>
            {attack.t9.steps.map((step) => (
              <div
                key={step.auditRef}
                style={{
                  padding: '0.6rem 0',
                  borderTop: '1px dashed var(--line)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.6rem' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.76rem' }}>
                    #{step.auditRef} · {step.label}（母體 {step.cohortSize}）
                  </span>
                  <span className="badge" data-tone={step.ok ? 'ok' : 'bad'}>
                    {step.ok ? '回答' : '拒絕'}
                  </span>
                </div>
                {!step.ok && step.explanation !== null && (
                  <p
                    className="note"
                    style={{ margin: '0.4rem 0 0', color: 'var(--rust)', fontSize: '0.76rem' }}
                  >
                    <Reason code={step.reason ?? 'DENIED'} />
                    {step.explanation}
                    <br />
                    已記錄於審計鏈 #{step.auditRef}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="note" style={{ marginTop: '1rem' }}>
            前兩個查詢各自都通過 k-匿名（門檻 {attack.t9.kAnonymity}）。第三個雖然母體也够大，
            但它與第一個查詢<strong>只差 3 人</strong>——兩次結果相減即可回推到那 3 人，於是被擋下。
          </p>
        </article>

        {/* P6 — evidence integrity index */}
        <article className="card" data-state={integrity.grade === 'D' ? 'revoked' : 'attested'}>
          <h3>P6 · 證據完整性指數</h3>
          <p className="issuer">supplier-x · 2026-08</p>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', margin: '0.8rem 0 1.2rem' }}>
            <span
              className="verdict"
              data-tone={gradeTone}
              style={{ fontSize: '2.8rem', margin: 0 }}
            >
              {integrity.grade}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '1.1rem', color: 'var(--text-dim)' }}>
              {integrity.index} / 100
            </span>
          </div>

          <ComponentBar label="承諾涵蓋率（防不記錄）" value={integrity.components.coverage} />
          <ComponentBar label="對帳一致率（防少報）" value={integrity.components.consistency} />

          <p className="note" style={{ marginTop: '1rem' }}>
            把數個各自已經 k-匿名、不指向個人的整合信號加權平均成單一分數與等級——回答「這家供應商的證據
            整體有多可信」，仍然只是匯總、不含任何識別資訊。缺席的信號會被平均掉，而不是假設滿分。
          </p>
        </article>
      </div>

      <p className="footnote">
        所有隊伍都會 demo 快樂路徑。這一頁 demo 的是<strong>系統自己被攻擊、並擋下來</strong>：
        prompt injection 因為判斷路徑上沒有 LLM 而無效；差分攻擊因為「兩次查詢相減可回推個人」而被拒；
        證據完整性指數把防不記錄、防少報等信號收斂成一個可比較的分數。
      </p>
    </section>
  );
}
