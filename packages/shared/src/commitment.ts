/**
 * The bridge between this repo's TypeScript and the circom circuit.
 *
 * A zero-knowledge proof that some numbers reconcile says nothing unless those
 * numbers are the ones inside the credential. The issuer commits to them at
 * issuance; the circuit proves it knows a preimage of that commitment. Both
 * sides must compute the identical Poseidon hash — the pinned vector in
 * commitment.test.ts is what catches divergence.
 */

import { buildPoseidon } from 'circomlibjs';

type Poseidon = Awaited<ReturnType<typeof buildPoseidon>>;

let poseidonPromise: Promise<Poseidon> | null = null;

function poseidon(): Promise<Poseidon> {
  // Built once: construction is expensive and the instance is stateless.
  const existing = poseidonPromise;
  if (existing !== null) return existing;

  const built = buildPoseidon();
  poseidonPromise = built;

  return built;
}

export async function poseidonCommit(values: readonly bigint[]): Promise<string> {
  const p = await poseidon();
  return p.F.toString(p([...values]));
}

/**
 * Working hours span a small range, so an unmasked commitment could be brute
 * forced back to its preimage. The salt is what makes the commitment hiding.
 */
export function randomSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(31));

  return BigInt(`0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
}
