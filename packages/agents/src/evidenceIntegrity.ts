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

export type IntegrityGrade = 'A' | 'B' | 'C' | 'D';

export interface IntegrityComponents {
  /** Fraction of the record set the factory committed to. [0,1] */
  readonly coverage?: number;
  /** Fraction of workers whose hours reconcile with pay. [0,1] */
  readonly consistency?: number;
  /** Fraction of records that are properly counter-signed. [0,1] */
  readonly attestation?: number;
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
  const present = [components.coverage, components.consistency, components.attestation].filter(
    (value): value is number => typeof value === 'number',
  );

  if (present.length === 0) {
    return { index: null, grade: null };
  }

  const mean = present.reduce((sum, value) => sum + clamp01(value), 0) / present.length;
  const index = Math.round(mean * 100);

  return { index, grade: gradeFor(index) };
}
