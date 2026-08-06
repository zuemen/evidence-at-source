/**
 * ZK reconciliation binding (Phase 4).
 *
 * The circuit itself is DOWNGRADED: this environment has no circom/Rust
 * toolchain, so the zero-knowledge proof is not wired to a real circuit. What is
 * real, and what the spec calls the security-critical part ("省略此步驟，整個證明
 * 失去意義"), is the *binding* between a proof and the credentials it claims to be
 * about. A proof over arbitrary numbers is worthless unless it is tied to
 * specific, valid, unrevoked credentials for one worker — that binding is
 * implemented and tested here in full.
 *
 * The proof math is behind an injected `verifyProof`. Wiring a real circuit means
 * supplying a `verifyProof` backed by a verifier (e.g. snarkjs) — nothing else in
 * this function changes. The default stub refuses, so a missing backend can never
 * be mistaken for a valid proof.
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
): Promise<{ ok: true; workerDID: unknown } | { ok: false; reason: ReasonCode }> {
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

  return { ok: true, workerDID: decision.payload['workerDID'] };
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

  return { ok: true, consistent: input.publicSignals.consistent };
}
