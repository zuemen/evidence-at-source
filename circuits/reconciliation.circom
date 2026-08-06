pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/*
 * Proves, without revealing any figure:
 *   1. the prover knows the values behind both credentials' commitments, and
 *   2. those values produce a specific reconciliation verdict.
 *
 * Everything is scaled integer arithmetic with no division. The TypeScript
 * reconcile() multiplies by a floating point overtime rate; a circuit that
 * rounded differently would disagree with the server on boundary cases, which
 * is worse than having no circuit at all. zkCircuit.test.ts pins the two
 * against each other.
 *
 * Note every product is kept quadratic — circom rejects degree-3 constraints,
 * so the pay calculation is built from intermediate signals rather than
 * written as one expression.
 */
template Reconciliation() {
    // Private — never leaves the worker's device.
    signal input totalHours;
    signal input overtimeHours;
    signal input hoursSalt;
    signal input deposit;
    signal input salarySalt;

    // Public — the verifier already holds all of these.
    signal input hoursCommitment;
    signal input salaryCommitment;
    signal input legalWageRate;
    signal input overtimeMultiplierBps;
    signal input toleranceBps;

    // Public output: 0 consistent, 1 underpaid, 2 overpaid.
    signal output verdict;

    // 1 — the values are the ones the issuer committed to.
    component hoursHash = Poseidon(3);
    hoursHash.inputs[0] <== totalHours;
    hoursHash.inputs[1] <== overtimeHours;
    hoursHash.inputs[2] <== hoursSalt;
    hoursHash.out === hoursCommitment;

    component salaryHash = Poseidon(2);
    salaryHash.inputs[0] <== deposit;
    salaryHash.inputs[1] <== salarySalt;
    salaryHash.out === salaryCommitment;

    // 2 — the same comparison reconcile() makes, scaled to integers.
    signal normalHours;
    normalHours <== totalHours - overtimeHours;

    signal normalPay;
    normalPay <== normalHours * legalWageRate;

    signal otPay;
    otPay <== overtimeHours * legalWageRate;

    signal otScaled;
    otScaled <== otPay * overtimeMultiplierBps;

    signal expectedScaled;
    expectedScaled <== normalPay * 10000 + otScaled;

    signal depositScaled;
    depositScaled <== deposit * 100000000;

    signal lowerBound;
    lowerBound <== expectedScaled * (10000 - toleranceBps);

    signal upperBound;
    upperBound <== expectedScaled * (10000 + toleranceBps);

    component below = LessThan(64);
    below.in[0] <== depositScaled;
    below.in[1] <== lowerBound;

    component above = GreaterThan(64);
    above.in[0] <== depositScaled;
    above.in[1] <== upperBound;

    // below -> 1, above -> 2, neither -> 0. Both can never hold at once.
    verdict <== below.out + 2 * above.out;
}

component main {public [
    hoursCommitment,
    salaryCommitment,
    legalWageRate,
    overtimeMultiplierBps,
    toleranceBps
]} = Reconciliation();
