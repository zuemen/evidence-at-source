/**
 * The only place a language model is allowed to exist in this system.
 *
 * ## Why there is an LLM here at all
 *
 * Until now there was none, anywhere. That made the T8 demonstration a
 * tautology: a system that never feeds free text to a language model is
 * trivially immune to prompt injection, and a guard test scanning for LLM
 * imports was protecting something that did not exist. Demonstrating that an
 * attack fails against an absent attack surface proves nothing.
 *
 * So the model goes exactly where it is useful and nowhere else: turning a
 * decision that has already been made into a sentence a human reviewer can
 * read. It is the last step, not a step.
 *
 * ## What this module may and may not do
 *
 *   - It receives a decision. It never produces one.
 *   - Its output is a string that is displayed and logged. Nothing in this
 *     repository reads that string back into a gate, a recommendation, or a
 *     credential check — `packages/agents/test/llmBoundary.test.ts` asserts it.
 *   - It is off by default. The offline explainer is what runs unless a caller
 *     deliberately supplies a model-backed one, so the demo works on a dead
 *     conference network and CI never touches the network at all.
 *
 * The injected text reaches the model on purpose. That is the demonstration:
 * the model's wording may change, and the verdict beside it does not.
 */

export interface ExplainableDecision {
  /** What the gate concluded. Already decided; not up for discussion. */
  readonly recommendation: string;
  /** Reason codes the gate produced. */
  readonly reasons: readonly string[];
  /** Risk flags for a human to weigh. */
  readonly riskFlags: readonly string[];
  /**
   * Free text copied from a credential — a supervisor's note, a remark field.
   *
   * This is the untrusted part, and it is handed to the model as data. A real
   * deployment has the same exposure the moment it shows a reviewer anything
   * written by the party being audited.
   */
  readonly remark?: string;
  /**
   * Figures the verifier is entitled to see, as strings.
   *
   * The guard treats any other number in the generated prose as invented —
   * which, since the model's only other source of digits is the untrusted
   * remark, is the safe reading.
   */
  readonly disclosedValues?: readonly string[];
}

export interface Explanation {
  readonly text: string;
  /** Which explainer produced this, so the UI never implies more than it has. */
  readonly source: 'offline' | 'model';
  /** Set when a model-backed explainer failed and the offline one stood in. */
  readonly degradedFrom?: string;
  /**
   * Guard violations that caused generated prose to be discarded. Present only
   * on a substituted explanation, and the caller's cue to record an
   * EXPLANATION_REJECTED entry in the audit trail.
   */
  readonly rejected?: readonly import('./guard.js').GuardViolation[];
}

export type Explainer = (decision: ExplainableDecision) => Promise<Explanation>;

/**
 * The default. Deterministic, offline, and immune to injection for the boring
 * reason that it never reads the remark.
 *
 * This is not a fallback in the apologetic sense — it is what ships. A demo
 * that needs the network to say anything at all is a demo that fails in the
 * room where it matters.
 */
export const offlineExplainer: Explainer = async (decision) => {
  const reasons =
    decision.reasons.length === 0 ? '無異常原因碼' : `原因碼：${decision.reasons.join('、')}`;
  const flags =
    decision.riskFlags.length === 0
      ? '無風險旗標'
      : `風險旗標：${decision.riskFlags.join('、')}`;

  return {
    text: `建議「${decision.recommendation}」。${reasons}。${flags}。本建議由閘門產生，仍待人類覆核。`,
    source: 'offline',
  };
};

/**
 * The model-backed explainer lives in `@eas/explain/claude`, deliberately in a
 * separate module. This entry point never references the Anthropic SDK, so the
 * browser bundle cannot pull a Node-oriented package in behind a lazy import —
 * which is exactly how a Buffer reference once reached the built site and left
 * every tab blank.
 */

export { checkExplanation, guardExplainer } from './guard.js';
export type { GuardViolation } from './guard.js';
