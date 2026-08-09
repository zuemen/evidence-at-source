/**
 * Evidence Integrity Index (P6).
 *
 * The system already produces several identifier-free integrity signals for a
 * cohort — how much of the record set the factory actually committed to
 * (coverage), how often reported hours reconcile with deposited pay
 * (consistency), and how much of the evidence is properly counter-signed
 * (attestation). This rolls the present ones into a single 0–100 index and a
 * grade, so "how trustworthy is this supplier's evidence overall?" has one
 * answer — still an aggregate, still naming nobody.
 *
 * Missing components are averaged out rather than assumed perfect: a metric that
 * invented a score for evidence it never saw would be worse than no metric.
 */

import type { CoercionSignals } from './coercion.js';

export type IntegrityGrade = 'A' | 'B' | 'C' | 'D';

export interface IntegrityComponents {
  /** Fraction of the record set the factory committed to. [0,1] */
  readonly coverage?: number;
  /** Fraction of workers whose hours reconcile with pay. [0,1] */
  readonly consistency?: number;
  /** Fraction of records that are properly counter-signed. [0,1] */
  readonly attestation?: number;
  /**
   * Coercion signals for the same cohort, if observed.
   *
   * Coverage and attestation both count worker confirmation as a good thing,
   * which is true only when the confirmation was freely given. These signals
   * discount both — a factory that obtained 100% by marching people past a
   * supervisor's tablet should not outrank one that obtained 78% by asking.
   */
  readonly coercion?: CoercionSignals;
}

export interface EvidenceIntegrityResult {
  readonly index: number | null;
  readonly grade: IntegrityGrade | null;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function gradeFor(index: number): IntegrityGrade {
  if (index >= 90) return 'A';
  if (index >= 75) return 'B';
  if (index >= 60) return 'C';
  return 'D';
}

export function computeEvidenceIntegrityIndex(
  components: IntegrityComponents,
): EvidenceIntegrityResult {
  // A discount applies to the two components that measure worker confirmation.
  // Consistency compares a factory's filings against a bank's records, and no
  // amount of pressure on a worker changes what the bank deposited.
  const discount = components.coercion?.discount ?? 0;
  const effective = (value: number | undefined): number | undefined =>
    value === undefined ? undefined : clamp01(value) * (1 - clamp01(discount));

  const present = [
    effective(components.coverage),
    components.consistency,
    effective(components.attestation),
  ].filter((value): value is number => typeof value === 'number');

  if (present.length === 0) {
    return { index: null, grade: null };
  }

  const mean = present.reduce((sum, value) => sum + clamp01(value), 0) / present.length;
  const index = Math.round(mean * 100);

  return { index, grade: gradeFor(index) };
}
