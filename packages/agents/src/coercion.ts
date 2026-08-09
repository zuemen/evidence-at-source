/**
 * Coercion signals — the correction to a metric that was pointing backwards.
 *
 * The evidence integrity index counted worker confirmation as a positive. A
 * factory that marches forty people past a supervisor's tablet gets 100%. A
 * factory that lets people decline gets 78%. Scored that way, the system
 * rewarded the behaviour it exists to expose, and a brand acting on the number
 * in good faith would have preferred the coercive supplier.
 *
 * Three signals, all computed from fields the attestations already carry, all
 * anonymous aggregates:
 *
 *   - **Time concentration.** Forty signatures inside one hour is a ceremony,
 *     not forty decisions.
 *   - **Device reuse.** One fingerprint across twenty workers is one person
 *     holding the phone.
 *   - **Hurried signatures.** Five seconds between a credential being issued
 *     and signed is not enough time to have read it.
 *
 * Every output is a ratio or a count over the cohort. Which device, whose
 * signature, and at what time are not returned and are not returnable — the
 * shape of the result has nowhere to put them.
 *
 * These signals detect the *shape* of coercion, not coercion itself. A patient
 * coercer who spaces signatures out over days, on the workers' own phones,
 * defeats all three. See docs/coercion-signals.md.
 */

/** One attestation, reduced to the three fields these signals need. */
export interface AttestationRecord {
  readonly attestedAtMs: number;
  /** When the credential being signed was issued. */
  readonly issuedAtMs: number;
  readonly deviceFingerprint: string;
}

export interface CoercionSignals {
  /** Largest share of the cohort signing inside any one hour. [0,1] */
  readonly timeConcentration: number;
  /** Share of signatures made on a device that signed for someone else. [0,1] */
  readonly deviceReuse: number;
  /** Share of signatures made too soon after issuance to have been read. [0,1] */
  readonly hurriedSignatures: number;
  /** Combined discount applied to coverage. [0,1] */
  readonly discount: number;
  /** How many attestations these signals were computed from. */
  readonly observations: number;
}

/**
 * Two minutes.
 *
 * Below this, a worker cannot plausibly have read a credential describing a
 * month of their working hours. Set deliberately low: the claim being made is
 * "nobody could have read this", not "nobody read it carefully", and the
 * stronger claim is the one that survives an argument.
 */
export const READING_TIME_FLOOR_MS = 2 * 60 * 1000;

/** The window a "signing ceremony" is measured over. */
const CONCENTRATION_WINDOW_MS = 60 * 60 * 1000;

/**
 * Weights. Device reuse is the heaviest because it is the least ambiguous:
 * a shift ending together explains concentration, and a simple credential
 * explains a quick signature, but nothing innocent explains one phone signing
 * for twenty different people.
 */
const WEIGHTS = { deviceReuse: 0.5, timeConcentration: 0.3, hurriedSignatures: 0.2 } as const;

/**
 * How much of coverage a fully coercive pattern can erase.
 *
 * Not 1.0. Even a coerced signature confirms that the record was shown to the
 * worker, which is more than no signature at all; and these signals are
 * circumstantial, so a discount that could zero a supplier outright would make
 * a false positive catastrophic. 0.6 is enough to invert the ranking — which
 * is the goal — without pretending the evidence is conclusive.
 */
export const MAX_COERCION_DISCOUNT = 0.6;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function computeCoercionSignals(
  records: readonly AttestationRecord[],
): CoercionSignals {
  const observations = records.length;
  if (observations === 0) {
    // No observations is not a clean bill of health.
    return {
      timeConcentration: 0,
      deviceReuse: 0,
      hurriedSignatures: 0,
      discount: 0,
      observations: 0,
    };
  }

  // 2-a: the largest share of the cohort falling inside any one-hour window.
  const times = records.map((r) => r.attestedAtMs).sort((a, b) => a - b);
  let widest = 0;
  for (let start = 0; start < times.length; start += 1) {
    let inWindow = 0;
    for (const t of times) {
      if (t >= times[start]! && t < times[start]! + CONCENTRATION_WINDOW_MS) inWindow += 1;
    }
    widest = Math.max(widest, inWindow);
  }
  // One signature is trivially "concentrated"; a cohort of one carries no signal.
  const timeConcentration = observations < 2 ? 0 : widest / observations;

  // 2-b: how many signatures came from a device that also signed for others.
  const perDevice = new Map<string, number>();
  for (const r of records) {
    perDevice.set(r.deviceFingerprint, (perDevice.get(r.deviceFingerprint) ?? 0) + 1);
  }
  const shared = [...perDevice.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  const deviceReuse = shared / observations;

  // 2-c: how many signatures arrived too fast to have involved reading.
  const hurried = records.filter(
    (r) => r.attestedAtMs - r.issuedAtMs < READING_TIME_FLOOR_MS,
  ).length;
  const hurriedSignatures = hurried / observations;

  const weighted =
    deviceReuse * WEIGHTS.deviceReuse +
    timeConcentration * WEIGHTS.timeConcentration +
    hurriedSignatures * WEIGHTS.hurriedSignatures;

  return {
    timeConcentration,
    deviceReuse,
    hurriedSignatures,
    discount: clamp01(weighted) * MAX_COERCION_DISCOUNT,
    observations,
  };
}
