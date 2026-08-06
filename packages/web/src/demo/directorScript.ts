/**
 * The director script: an ordered set of captioned beats for walking a viewer
 * (or a screen recording) through the demo. Each beat starts from a clean state
 * and applies its own self-contained sequence of actions, so beats never stack —
 * "revoke agent" and "revoke worker" tell separate stories rather than piling up.
 */

export type DirectorTab = 'wallet' | 'console' | 'attack';

export type DirectorAction = 'reset' | 'attestAll' | 'revoke' | 'revokeAgentBank' | 'revokeQvi';

export interface DirectorBeat {
  readonly id: string;
  readonly tab: DirectorTab;
  readonly title: string;
  readonly narration: string;
  /** Applied in order before the beat is shown. Always begins with `reset`. */
  readonly actions: readonly DirectorAction[];
}

export const DIRECTOR_BEATS: readonly DirectorBeat[] = [
  {
    id: 'intro',
    tab: 'wallet',
    title: '四項事實，全由雇主單方出示',
    narration:
      '仲介費、證件保管、契約同意、工時——關於這個人的四項事實，全部由雇主單方簽發。四張憑證初始全部標示「待勞工反簽」。',
    actions: ['reset'],
  },
  {
    id: 'attest',
    tab: 'wallet',
    title: '證據前置：勞工反簽封存',
    narration:
      '每一件事在發生的當下就由雙方共同簽章封存，不是事後才去追查誰說謊。勞工逐一反簽，卡片邊條由琥珀轉青。',
    actions: ['reset', 'attestAll'],
  },
  {
    id: 'authorization',
    tab: 'wallet',
    title: '出示前，錢包先驗 Agent 授權',
    narration:
      '錢包先驗證查驗 Agent 的授權憑證，把授權範圍攤開給勞工看——上限由機構給、下限由勞工給。不在授權範圍內的憑證被標示並淡化。',
    actions: ['reset'],
  },
  {
    id: 'split',
    tab: 'console',
    title: '同一批憑證，兩種最小答案',
    narration:
      '銀行的 Agent A 得到建議核准與布林結論；品牌的 Agent B 得到合規率。兩邊都拿不到原始數字，個體查詢一律拒絕。',
    actions: ['reset', 'attestAll'],
  },
  {
    id: 'risk-and-limits',
    tab: 'console',
    title: '查得到風險，查不到人——以及我們不能取代什麼',
    narration:
      '銀行側的風險旗標是防詐的那一半：同一身分短期在多家機構申辦，系統只回報「超過門檻」，不回報申辦去向，而且旗標只供人類覆核、不決定任何事。品牌側的 RBA 項目清單則是誠實聲明：宿舍條件、消防、申訴機制回 REQUIRES_ONSITE_AUDIT——憑證不能取代走進廠房，這句話寫在程式裡。',
    actions: ['reset', 'attestAll'],
  },
  {
    id: 'l0-revoke',
    tab: 'console',
    title: '機構撤銷 Agent：L0 當場失效、零讀取',
    narration:
      '按下機構撤銷後，該 Agent 的查詢立即在 L0 失效，畫面顯示「一個勞工欄位都沒讀到」。另一側 Agent 不受影響。',
    actions: ['reset', 'attestAll', 'revokeAgentBank'],
  },
  {
    id: 'vlei-cascade',
    tab: 'console',
    title: 'GLEIF 撤銷 QVI：整條信任鏈當場塌掉',
    narration:
      '機構信任不是一份名單，是一條 vLEI 憑證鏈：GLEIF → QVI → 法人 vLEI → Agent 授權角色。模擬 GLEIF 撤銷 QVI 資格：兩個 Agent 的授權同時在 L0 失效、四家機構的法人憑證全數失去背書——而且沒有任何人需要去同步任何名單。',
    actions: ['reset', 'attestAll', 'revokeQvi'],
  },
  {
    id: 'subject-revoke',
    tab: 'console',
    title: '離境連動撤銷：全部失效、他人不受影響',
    narration:
      '模擬勞工離境：他的全部憑證同時失效，銀行端拒絕；但母體中其他勞工的證據不受影響，品牌仍拿得到匯總答案。',
    actions: ['reset', 'attestAll', 'revoke'],
  },
  {
    id: 'receipts',
    tab: 'console',
    title: '被質疑時拿得出證明，撤銷時找得到該通知的人',
    narration:
      '查驗留下一張收據：只有項目名稱與憑證雜湊，沒有任何原始數值，被 NGO 質疑「你到底驗過什麼」時可以直接出示。畫面上那個勾不是寫死的，是拿查驗方公鑰當場重新驗簽的結果。旁邊的名單則是反向索引：這張憑證一旦被撤銷，每一個曾經驗過它的人都會收到通知。',
    actions: ['reset', 'attestAll'],
  },
  {
    id: 'attacks',
    tab: 'attack',
    title: '我們 demo 自己被攻擊，並擋下來',
    narration:
      'Prompt injection 因判斷路徑上沒有 LLM 而無效；差分攻擊因兩次查詢相減可回推個人而被拒；證據完整性指數把防不記錄、防少報收斂成一個分數。',
    actions: ['reset'],
  },
];
