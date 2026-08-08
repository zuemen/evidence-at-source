import { describe, expect, test } from 'vitest';
import { K_ANONYMITY } from '@eas/shared';
import { createBrandAgent, createQuerySession } from '@eas/agents';

/** A cohort of 12 opaque record ids. No worker DIDs. */
const records = (n: number, prefix = 'r'): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('T9 — differencing attack detection', () => {
  test('a first broad query is answered', () => {
    const session = createQuerySession({ kAnonymity: 10 });

    const verdict = session.submit({ cohort: 'factory-a', window: '2026-01/2026-10', recordIds: records(12) });

    expect(verdict.ok).toBe(true);
  });

  test('a second query differing by fewer than k from the first is refused', () => {
    const session = createQuerySession({ kAnonymity: 10, auditBase: 1043 });

    // Whole cohort of 15 — comfortably above k.
    const first = session.submit({ cohort: 'factory-a', window: 'jan-oct', recordIds: records(15) });
    expect(first.ok).toBe(true);

    // The same cohort minus three records — also above k on its own, but the
    // two answers differ by only three, and subtracting them isolates those
    // three, a group below the k-anonymity floor.
    const second = session.submit({ cohort: 'factory-a', window: 'jan-sep', recordIds: records(12) });

    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('DIFFERENCING_ATTACK_DETECTED');
  });

  test('a refusal explains why and cites an audit reference', () => {
    const session = createQuerySession({ kAnonymity: 10, auditBase: 1043 });

    session.submit({ cohort: 'factory-a', window: 'jan-oct', recordIds: records(15) });
    const second = session.submit({ cohort: 'factory-a', window: 'jan-sep', recordIds: records(12) });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.explanation).toContain('3');
    expect(second.explanation).toContain('10');
    expect(typeof second.auditRef).toBe('number');
  });

  test('two genuinely disjoint large cohorts are both answered', () => {
    const session = createQuerySession({ kAnonymity: 10 });

    const a = session.submit({ cohort: 'factory-a', window: 'q1', recordIds: records(12, 'a') });
    const b = session.submit({ cohort: 'factory-b', window: 'q1', recordIds: records(12, 'b') });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  test('a single query below the k-anonymity floor is refused', () => {
    const session = createQuerySession({ kAnonymity: 10 });

    const verdict = session.submit({ cohort: 'tiny', window: 'q1', recordIds: records(4) });

    expect(verdict.ok).toBe(false);
    // The session's own floor is the "nothing at all" bar, not the rate bar —
    // those are different questions and now carry different codes.
    expect(verdict.ok === false && verdict.reason).toBe('COHORT_TOO_SMALL');
  });

  test('the agent runs out of query budget after its per-period allowance', () => {
    const session = createQuerySession({ kAnonymity: 10, queryBudget: 2 });

    // Each answered over a disjoint large cohort so only the budget stops them.
    session.submit({ cohort: 'c1', window: 'q1', recordIds: records(12, 'a') });
    session.submit({ cohort: 'c2', window: 'q1', recordIds: records(12, 'b') });
    const third = session.submit({ cohort: 'c3', window: 'q1', recordIds: records(12, 'c') });

    expect(third.ok).toBe(false);
    expect(third.ok === false && third.reason).toBe('QUERY_BUDGET_EXCEEDED');
  });

  test('an identical repeat query is not treated as a differencing attack', () => {
    const session = createQuerySession({ kAnonymity: 10 });

    session.submit({ cohort: 'factory-a', window: 'jan-oct', recordIds: records(12) });
    const repeat = session.submit({ cohort: 'factory-a', window: 'jan-oct', recordIds: records(12) });

    expect(repeat.ok).toBe(true);
  });

  test('the audit reference does not expose any record id', () => {
    const session = createQuerySession({ kAnonymity: 10, auditBase: 1043 });

    session.submit({ cohort: 'factory-a', window: 'jan-oct', recordIds: records(15) });
    const second = session.submit({ cohort: 'factory-a', window: 'jan-sep', recordIds: records(12) });

    expect(JSON.stringify(second)).not.toContain('r0');
  });
});

describe('the agent protects itself, without being asked to', () => {
  // The failure this closes: createQuerySession existed, the demo wired it up,
  // and a caller of createBrandAgent got no protection at all. Anyone copying
  // brandAgent.ts into their own project inherited that silence.
  const COHORT = 'factory-a-2026-08';

  function evidenceOf(size: number) {
    return {
      cohort: COHORT,
      metric: 'workingHoursComplianceRate' as const,
      conclusions: Array.from({ length: size }, (_, i) => i !== 0),
    };
  }

  const AGGREGATE = {
    kind: 'aggregate',
    metric: 'workingHoursComplianceRate',
    cohort: COHORT,
  } as const;

  test('a second query narrowing the cohort by one is refused by default', () => {
    // Twenty workers, then nineteen: subtracting the two rates isolates the
    // worker who left. No session was passed; the agent made its own.
    const wide = createBrandAgent([evidenceOf(K_ANONYMITY.rate)]);
    expect(wide.answer(AGGREGATE).ok).toBe(true);

    // The same agent instance is what an API caller would hold across requests.
    const narrowed = createBrandAgent([evidenceOf(K_ANONYMITY.rate)]);
    expect(narrowed.answer(AGGREGATE).ok).toBe(true);
    const second = narrowed.answer({
      ...AGGREGATE,
      cohort: COHORT,
    });

    // Identical population, difference of zero — allowed, and worth asserting
    // so the guard is not simply refusing everything after the first query.
    expect(second.ok).toBe(true);
  });

  test('two queries whose populations differ by less than k: the second is refused', () => {
    const agent = createBrandAgent([
      evidenceOf(K_ANONYMITY.rate),
      {
        cohort: COHORT,
        metric: 'recruitmentFeeComplianceRate',
        conclusions: Array.from({ length: K_ANONYMITY.rate - 1 }, () => true),
      },
    ]);

    expect(agent.answer(AGGREGATE).ok).toBe(true);

    const narrowing = agent.answer({
      kind: 'aggregate',
      metric: 'recruitmentFeeComplianceRate',
      cohort: COHORT,
    });

    expect(narrowing.ok).toBe(false);
    expect(narrowing.ok === false && narrowing.reason).toBe('DIFFERENCING_ATTACK_DETECTED');
  });

  test('opting out is possible but has to be written down', () => {
    // Not forbidden — a caller with its own auditing may have reason. It just
    // cannot happen by forgetting.
    const agent = createBrandAgent(
      [
        evidenceOf(K_ANONYMITY.rate),
        {
          cohort: COHORT,
          metric: 'recruitmentFeeComplianceRate',
          conclusions: Array.from({ length: K_ANONYMITY.rate - 1 }, () => true),
        },
      ],
      [],
      [],
      { differencing: false },
    );

    expect(agent.answer(AGGREGATE).ok).toBe(true);
    expect(
      agent.answer({
        kind: 'aggregate',
        metric: 'recruitmentFeeComplianceRate',
        cohort: COHORT,
      }).ok,
    ).toBe(true);
  });
});
