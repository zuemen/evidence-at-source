/**
 * Overtime is voluntary only if the worker said so.
 *
 * RBA CoC 8.0 requires that all overtime be voluntary, and this project had no
 * field for it at all. Adding one has an obvious failure mode: an employer who
 * will confiscate a passport will also tick "voluntary" in their own system.
 * A factory asserting that its overtime was voluntary is worth nothing.
 *
 * So the claim is only readable as true when the worker's counter-signature is
 * present and has not been withdrawn. This is the second legitimate use of the
 * dual signature — the first is proving the employer did not alter the record
 * afterwards, and this one is that **some facts only the subject has standing
 * to assert.**
 *
 * What it still cannot do: a worker under threat signs too. This proves that
 * someone was asked and that they signed, not that they wanted the shift. The
 * position is the same one identity.ts takes about coercion, and stating it
 * plainly is the only honest option.
 */

export interface OvertimeConsentInput {
  /** What the credential claims. An employer wrote this. */
  readonly claimed: unknown;
  /** Whether a worker counter-signature is present for this credential. */
  readonly attested: boolean;
  /** Whether the worker has since withdrawn it. */
  readonly withdrawn?: boolean;
}

/**
 * Resolves the claim against the worker's signature.
 *
 * Returns false in every case except "claimed true, attested, not withdrawn" —
 * including when the input is malformed, because an unreadable claim is not an
 * established one.
 */
export function overtimeVoluntary(input: OvertimeConsentInput): boolean {
  if (input.claimed !== true) return false;
  if (!input.attested) return false;

  return input.withdrawn !== true;
}
