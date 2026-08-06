/**
 * ZK reconciliation binding (Phase 4).
 *
 * The circuit is real (circom + Groth16, see `circuits/`). What this module
 * adds is the part that makes a proof mean anything: the **binding** between a
 * proof and the credentials it claims to be about. A proof that some numbers
 * reconcile is worthless on its own — it has to be tied to specific, valid,
 * unrevoked credentials belonging to one worker, and to the numbers those
 * credentials actually committed to.
 *
 * Six checks, each of which alone would leave a hole:
 *
 *   1. The proof verifies against the circuit's verification key.
 *   2. The hours credential is genuine, unrevoked, and is the one whose hash
 *      the prover named.
 *   3. The same for the salary credential.
 *   4. Both credentials name the same worker — otherwise two people's numbers
 *      could be reconciled against each other.
 *   5. The commitments the circuit proved preimages of are the commitments
 *      inside those two credentials. Without this the prover could open any
 *      pair of commitments while presenting an unrelated pair of credentials.
 *   6. The verdict the caller reports is the verdict the circuit emitted.
 *
 * The proof math sits behind an injected `verifyProof`, and the default stub
 * refuses: a caller with no verification key has proved nothing, and nothing
 * must never look like success.
 *
 * Circuit design and the M7 role change are documented in docs/zk-reconciliation.md.
 */

import { credentialHash, type PublicJwk, type ReasonCode, type RevocationRegistry } from '@eas/shared';
import type { IssuerSigningKey } from './vleiBridge.js';
import { checkCredentialLayer } from './credentialLayer.js';

export interface ReconciliationProofPublicSignals {
  readonly hoursCredentialHash: string;
  readonly salaryCredentialHash: string;
  readonly legalWageRate: number;
  readonly overtimeMultiplier: number;
  readonly toleranceBps: number;
  /** The circuit's public output: do the private numbers reconcile within tolerance. */
  readonly consistent: boolean;
  /**
   * The circuit's own public signals, in circuit order:
   * `[verdict, hoursCommitment, salaryCommitment, rate, overtimeBps, toleranceBps]`.
   *
   * The fields above describe the reconciliation in this repo's terms; this one
   * is what Groth16 actually checks against. It is optional because the binding
   * checks are meaningful on their own, but a verifier given no signals refuses
   * rather than assuming — an absent proof is not a passing one.
   */
  readonly circuitSignals?: readonly string[];
}

export interface BoundCredential {
  readonly presentation: string;
  readonly attestation: string;
  readonly issuerPublicKey: IssuerSigningKey;
  readonly workerPublicKey: PublicJwk;
}

export type ProofVerifier = (
  proof: unknown,
  publicSignals: ReconciliationProofPublicSignals,
) => boolean | Promise<boolean>;

export interface VerifyReconciliationProofInput {
  readonly proof: unknown;
  readonly publicSignals: ReconciliationProofPublicSignals;
  readonly hours: BoundCredential;
  readonly salary: BoundCredential;
  readonly revocations?: RevocationRegistry;
  /** Supplies the ZK proof check. Default refuses — no backend is wired here. */
  readonly verifyProof?: ProofVerifier;
}

export type ReconciliationProofResult =
  | { readonly ok: true; readonly consistent: boolean }
  | { readonly ok: false; readonly reason: ReasonCode };

/** Default proof verifier: refuses, so an absent ZK backend never passes. */
export const stubProofVerifier: ProofVerifier = () => false;

/**
 * The real verifier, backed by the circuit in `circuits/`.
 *
 * Deliberately not the default: a caller that has no verification key must
 * still fail closed. A missing backend must never be indistinguishable from a
 * valid proof, which is exactly what silently defaulting to "verified" would
 * make it.
 */
export function createGroth16Verifier(verificationKey: unknown): ProofVerifier {
  return async (proof, publicSignals) => {
    const signals = publicSignals.circuitSignals;
    // No signals means nothing was proved. Refusing here is the whole point.
    if (signals === undefined) return false;

    try {
      const { groth16 } = await import('snarkjs');
      return await groth16.verify(verificationKey, signals, proof);
    } catch {
      // A malformed proof, a mismatched key or a missing backend all mean the
      // same thing here: this proof has not been shown to hold.
      return false;
    }
  };
}

/** Validates a credential and confirms its hash is the one the proof was bound to. */
async function checkBinding(
  credential: BoundCredential,
  expectedHash: string,
  revocations: RevocationRegistry | undefined,
): Promise<
  { ok: true; workerDID: unknown; valueCommitment: unknown } | { ok: false; reason: ReasonCode }
> {
  const decision = await checkCredentialLayer({
    presentation: credential.presentation,
    attestation: credential.attestation,
    issuerPublicKey: credential.issuerPublicKey,
    workerPublicKey: credential.workerPublicKey,
    requiredClaims: [],
    ...(revocations === undefined ? {} : { revocations }),
  });
  if (!decision.ok) {
    return { ok: false, reason: decision.reason };
  }

  if (credentialHash(credential.presentation) !== expectedHash) {
    return { ok: false, reason: 'PROOF_BINDING_MISMATCH' };
  }

  return {
    ok: true,
    workerDID: decision.payload['workerDID'],
    valueCommitment: decision.payload['valueCommitment'],
  };
}

export async function verifyReconciliationProof(
  input: VerifyReconciliationProofInput,
): Promise<ReconciliationProofResult> {
  const verifyProof = input.verifyProof ?? stubProofVerifier;

  // Check 1 — the proof itself.
  if (!(await verifyProof(input.proof, input.publicSignals))) {
    return { ok: false, reason: 'PROOF_INVALID' };
  }

  // Checks 2 & 3 — each hash binds to a valid, unrevoked credential.
  const hoursBinding = await checkBinding(
    input.hours,
    input.publicSignals.hoursCredentialHash,
    input.revocations,
  );
  if (!hoursBinding.ok) return { ok: false, reason: hoursBinding.reason };

  const salaryBinding = await checkBinding(
    input.salary,
    input.publicSignals.salaryCredentialHash,
    input.revocations,
  );
  if (!salaryBinding.ok) return { ok: false, reason: salaryBinding.reason };

  // Check 4 — both credentials name the same worker.
  if (hoursBinding.workerDID !== salaryBinding.workerDID) {
    return { ok: false, reason: 'PROOF_SUBJECT_MISMATCH' };
  }

  // Checks 5 & 6 — the circuit's own public signals, read in circuit order:
  // [verdict, hoursCommitment, salaryCommitment, rate, overtimeBps, tolerance].
  //
  // Without check 5 the prover could open any pair of commitments while
  // presenting an unrelated pair of credentials, and checks 2–4 would all
  // still pass: they establish that the credentials are real, not that they
  // are the ones the proof is about. Without check 6 a caller could report
  // CONSISTENT over a proof whose verdict said the opposite.
  const signals = input.publicSignals.circuitSignals;
  if (signals !== undefined) {
    if (
      signals[1] !== String(hoursBinding.valueCommitment) ||
      signals[2] !== String(salaryBinding.valueCommitment)
    ) {
      return { ok: false, reason: 'PROOF_COMMITMENT_MISMATCH' };
    }

    if ((signals[0] === '0') !== input.publicSignals.consistent) {
      return { ok: false, reason: 'PROOF_VERDICT_MISMATCH' };
    }
  }

  return { ok: true, consistent: input.publicSignals.consistent };
}
