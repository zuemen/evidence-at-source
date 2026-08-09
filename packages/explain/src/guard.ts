/**
 * The consistency guard — what makes having a language model here defensible.
 *
 * A model that only writes prose is easy to justify and easy to dismiss: take
 * it out and nothing about the system's behaviour changes. The tempting answer
 * is to give it something load-bearing to do, which would destroy the property
 * that matters most — that the same evidence always produces the same verdict.
 *
 * So the model stays where it is, and this sits between it and the reader.
 * Before any generated sentence is shown, it is checked against the decision
 * that was already made. If the prose contradicts the verdict, invents a
 * number, or announces a decision nobody made, it is thrown away and the
 * deterministic template is shown instead.
 *
 * This is what makes the T8 demonstration mean something. An injected
 * instruction can change what the model writes — that is what models do. It
 * cannot change what the gate decided, and now it cannot reach the reader
 * either. The demonstration is no longer "we have no attack surface"; it is
 * "the attack lands, and here is the thing that catches it".
 *
 * **The guard is pure rules and always will be.** A guard that called a model
 * could be talked out of its answer by the same injection it was hired to
 * catch, and a guard that needed the network would be taken down by the same
 * outage it exists to survive.
 */

import { offlineExplainer, type ExplainableDecision, type Explainer, type Explanation } from './index.js';

export type GuardViolation =
  /** The prose recommends the opposite of what the gate concluded. */
  | 'CONTRADICTS_RECOMMENDATION'
  /** The prose contains a figure the decision never disclosed. */
  | 'REVEALS_UNDISCLOSED_VALUE'
  /** The prose announces a decision as already made. */
  | 'CLAIMS_FINAL_DECISION';

/** Phrases that assert a decision has been taken rather than recommended. */
const FINALITY_PHRASES = [
  '已核准',
  '已通過',
  '已開立',
  '已批准',
  '已放行',
  'has been approved',
  'is approved',
  'account opened',
];

/** Wording that recommends approval, and wording that recommends refusal. */
const APPROVAL_WORDS = ['建議核准', '建議通過', 'recommend approval', 'recommend approving'];
const REFUSAL_WORDS = ['建議婉拒', '建議拒絕', '建議否准', 'recommend declining', 'recommend refusal'];

const includesAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * Numbers the prose may legitimately contain: those the decision itself
 * carries. Everything else is a figure the model produced from somewhere, and
 * "somewhere" is either the untrusted remark or the model's imagination.
 */
function permittedNumbers(decision: ExplainableDecision): Set<string> {
  const permitted = new Set<string>(decision.disclosedValues ?? []);

  for (const text of [...decision.reasons, ...decision.riskFlags, decision.recommendation]) {
    for (const match of text.match(/\d+/g) ?? []) permitted.add(match);
  }

  return permitted;
}

/**
 * Checks generated prose against the decision it claims to describe.
 *
 * Synchronous, dependency-free, and total: every rejection is a property of
 * the two strings in front of it, so the same pair always gives the same
 * verdict.
 */
export function checkExplanation(
  text: string,
  decision: ExplainableDecision,
): readonly GuardViolation[] {
  const violations: GuardViolation[] = [];

  // 1 — the prose must not recommend the opposite of the verdict.
  const declined = decision.recommendation.startsWith('DECLINE');
  const saysApprove = includesAny(text, APPROVAL_WORDS);
  const saysRefuse = includesAny(text, REFUSAL_WORDS);
  if ((declined && saysApprove) || (!declined && saysRefuse)) {
    violations.push('CONTRADICTS_RECOMMENDATION');
  }

  // 2 — no figure may appear that the decision did not carry.
  const permitted = permittedNumbers(decision);
  const invented = (text.match(/\d+/g) ?? []).filter((n) => !permitted.has(n));
  if (invented.length > 0) {
    violations.push('REVEALS_UNDISCLOSED_VALUE');
  }

  // 3 — nothing here decides anything, so nothing may say it has.
  if (includesAny(text, FINALITY_PHRASES)) {
    violations.push('CLAIMS_FINAL_DECISION');
  }

  return violations;
}

/**
 * Wraps an explainer so nothing it produces reaches a reader unchecked.
 *
 * A rejection is reported on the result rather than thrown: the caller needs
 * to record an EXPLANATION_REJECTED entry in the audit trail, and an exception
 * would leave it with nothing to record.
 */
export function guardExplainer(inner: Explainer): Explainer {
  return async (decision) => {
    let produced: Explanation;
    try {
      produced = await inner(decision);
    } catch (error) {
      // A model that is down must never take the system with it.
      const fallback = await offlineExplainer(decision);
      return { ...fallback, degradedFrom: error instanceof Error ? error.message : 'explainer failed' };
    }

    const violations = checkExplanation(produced.text, decision);
    if (violations.length === 0) return produced;

    const fallback = await offlineExplainer(decision);

    return { ...fallback, rejected: violations, degradedFrom: produced.source };
  };
}
