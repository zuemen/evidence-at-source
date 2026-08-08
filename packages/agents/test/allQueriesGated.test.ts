import { describe, expect, test } from 'vitest';
import { K_ANONYMITY } from '@eas/shared';
import { createBrandAgent, type BrandAgent } from '@eas/agents';

/**
 * Why this file exists.
 *
 * An audit found three of Agent B's six query methods returning cohort-derived
 * figures with no k-anonymity check at all — a two-person cohort answered
 * `coverage: 0.5`, which is a statement about a named person and the exact
 * thing this project claims to make impossible. Nobody had bypassed a rule;
 * the methods were simply added later than the rule was, and the rule lived in
 * the three places that happened to remember it.
 *
 * So the guard is enumerative rather than exemplary. It walks every method the
 * agent exposes and requires each one to refuse when its population is below
 * the bar. A method added tomorrow is included automatically: either it refuses
 * like the others, or it appears in NON_COHORT_QUERIES with a written reason.
 * Adding one silently is not an option this test leaves open.
 */

/**
 * Methods that answer from something other than a population of workers, and
 * therefore have no cohort to be too small.
 *
 * `answerRbaItem` classifies a named RBA item — its answer is the same whether
 * one worker or ten thousand are employed, and it carries no figure derived
 * from anybody. Every other entry added here needs the same kind of argument
 * written next to it.
 */
const NON_COHORT_QUERIES = new Set<keyof BrandAgent>(['answerRbaItem']);

/** Reason codes that mean "the population was too small to answer from". */
const K_ANONYMITY_REASONS = new Set(['AGGREGATE_BELOW_K_ANONYMITY', 'COHORT_TOO_SMALL']);

/** Below the floor: nothing at all may be answered about a cohort this size. */
const TINY = K_ANONYMITY.minimum - 1;

const COHORT = 'factory-a-2026-08';
const WINDOW = '2026-08';

function agentWithTinyCohorts(): BrandAgent {
  return createBrandAgent(
    [
      {
        cohort: COHORT,
        metric: 'workingHoursComplianceRate',
        conclusions: Array.from({ length: TINY }, (_, i) => i === 0),
      },
    ],
    [
      {
        cohort: COHORT,
        window: WINDOW,
        outcomes: Array.from({ length: TINY }, (_, i) =>
          i === 0 ? ('DISCREPANCY_UNDERPAID' as const) : ('CONSISTENT' as const),
        ),
      },
    ],
    [{ cohort: COHORT, window: WINDOW, signals: Array.from({ length: TINY }, (_, i) => i === 0) }],
  );
}

/** Calls a method with whatever shape of arguments it takes. */
function callWithTinyCohort(agent: BrandAgent, method: keyof BrandAgent): unknown {
  if (method === 'answer') {
    return agent.answer({
      kind: 'aggregate',
      metric: 'workingHoursComplianceRate',
      cohort: COHORT,
    });
  }

  const fn = agent[method] as (a: string, b: string) => unknown;

  return fn.call(agent, COHORT, WINDOW);
}

describe('every cohort-derived query is gated, including ones added later', () => {
  const agent = agentWithTinyCohorts();
  const methods = (Object.keys(agent) as (keyof BrandAgent)[]).filter(
    (name) => typeof agent[name] === 'function',
  );

  test('the agent exposes methods, so an empty enumeration cannot pass silently', () => {
    expect(methods.length).toBeGreaterThan(0);
  });

  test('every enumerated method is either gated or listed as non-cohort', () => {
    const gated = methods.filter((name) => !NON_COHORT_QUERIES.has(name));

    // If this drops to zero the enumeration has broken, not the gating.
    expect(gated.length).toBeGreaterThan(0);

    const ungated: string[] = [];
    for (const method of gated) {
      const answer = callWithTinyCohort(agent, method) as {
        ok: boolean;
        reason?: string;
      };

      if (answer.ok || !K_ANONYMITY_REASONS.has(answer.reason ?? '')) {
        ungated.push(`${method} → ${answer.ok ? 'answered' : (answer.reason ?? 'unknown')}`);
      }
    }

    expect(ungated, 'these methods answered from a cohort below the k-anonymity bar').toEqual(
      [],
    );
  });

  test('a refusal carries no rate, count, coverage or components', () => {
    // A refusal that still leaked a figure would pass the check above while
    // defeating its purpose.
    const leaked: string[] = [];

    for (const method of methods.filter((name) => !NON_COHORT_QUERIES.has(name))) {
      const serialised = JSON.stringify(callWithTinyCohort(agent, method));
      for (const field of ['rate', 'count', 'coverage', 'components', 'index', 'consistent']) {
        if (serialised.includes(`"${field}"`)) leaked.push(`${method} leaked ${field}`);
      }
    }

    expect(leaked).toEqual([]);
  });

  test('the same methods answer once the cohort is large enough', () => {
    // Proves the refusals above come from the population size and not from a
    // broken fixture that would refuse everything regardless.
    const size = K_ANONYMITY.rate;
    const big = createBrandAgent(
      [
        {
          cohort: COHORT,
          metric: 'workingHoursComplianceRate',
          conclusions: Array.from({ length: size }, (_, i) => i !== 0),
        },
      ],
      [
        {
          cohort: COHORT,
          window: WINDOW,
          outcomes: Array.from({ length: size }, () => 'CONSISTENT' as const),
        },
      ],
      [{ cohort: COHORT, window: WINDOW, signals: Array.from({ length: size }, () => false) }],
    );

    for (const method of methods.filter((name) => !NON_COHORT_QUERIES.has(name))) {
      const answer = callWithTinyCohort(big, method) as { ok: boolean };
      expect(answer.ok, `${method} refused a cohort that clears the bar`).toBe(true);
    }
  });
});
