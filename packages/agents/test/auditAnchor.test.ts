import { describe, expect, test } from 'vitest';
import {
  checkpointFor,
  createAuditTrail,
  createLocalAnchorLog,
  verifyAgainstCheckpoints,
  verifyAuditTrail,
} from '../src/index.js';
import type { AuditTrail } from '../src/auditTrail.js';

/**
 * The gap these tests close is the one the audit trail's own documentation
 * admits to: a holder who drops entries off the end produces a chain that
 * verifies perfectly, because a truncated chain is a valid chain.
 *
 * So each test here asserts the pair — `verifyAuditTrail` still says the trail
 * is fine, and the checkpoint says it is not the trail we saw. Asserting only
 * the second half would hide the reason this mechanism has to exist.
 */

function record(trail: AuditTrail, action: string, decision: 'ALLOW' | 'DENY' = 'ALLOW'): void {
  trail.record({
    agentRole: 'bank-agent',
    layer: 'L1',
    action,
    decision,
    reason: decision === 'DENY' ? 'POLICY_CHECK_FAILED' : null,
    basis: { delegationHash: 'hash-001', ecrSaid: 'ESaid001' },
  });
}

describe('a checkpoint makes a dropped tail detectable', () => {
  test('a trail matching its checkpoints verifies, and reports the unprotected window', async () => {
    const trail = createAuditTrail();
    record(trail, 'check-hours');
    record(trail, 'check-fee');

    const anchor = createLocalAnchorLog();
    const atTwo = checkpointFor(await trail.export());
    expect(atTwo).not.toBeNull();
    await anchor.publish(atTwo!);

    record(trail, 'check-custody');
    const exported = await trail.export();

    const result = verifyAgainstCheckpoints(exported, anchor.checkpoints());

    expect(result).toEqual({ ok: true, checkpointGap: 1, checkpointsChecked: 1 });
  });

  test('truncating the tail passes chain verification and fails the checkpoint', async () => {
    const trail = createAuditTrail();
    record(trail, 'check-hours');
    record(trail, 'check-fee');
    record(trail, 'refuse-individual-query', 'DENY');

    const anchor = createLocalAnchorLog();
    await anchor.publish(checkpointFor(await trail.export())!);

    // The holder publishes only what suits them: the denial is simply absent.
    const truncated = (await trail.export()).slice(0, 2);

    const chain = await verifyAuditTrail(truncated);
    expect(chain).toEqual({ ok: true, verifiedEntries: 2, sealed: false });

    expect(verifyAgainstCheckpoints(truncated, anchor.checkpoints())).toEqual({
      ok: false,
      reason: 'TAIL_TRUNCATED',
      atSeq: 3,
    });
  });

  test('a rebuilt trail of the same length is caught by the digest, not the length', async () => {
    const trail = createAuditTrail();
    record(trail, 'check-hours');
    record(trail, 'refuse-individual-query', 'DENY');

    const anchor = createLocalAnchorLog();
    await anchor.publish(checkpointFor(await trail.export())!);

    // A holder with the signing key can produce a fresh, internally consistent
    // trail where the refusal became an approval. Same length, same shape.
    const rewritten = createAuditTrail();
    record(rewritten, 'check-hours');
    record(rewritten, 'check-hours-again');
    const exported = await rewritten.export();

    expect(await verifyAuditTrail(exported)).toEqual({
      ok: true,
      verifiedEntries: 2,
      sealed: false,
    });

    expect(verifyAgainstCheckpoints(exported, anchor.checkpoints())).toEqual({
      ok: false,
      reason: 'ANCHOR_MISMATCH',
      atSeq: 2,
    });
  });

  test('several checkpoints all have to hold, and the earliest break is named', async () => {
    const trail = createAuditTrail();
    const anchor = createLocalAnchorLog();

    record(trail, 'entry-1');
    await anchor.publish(checkpointFor(await trail.export())!);
    record(trail, 'entry-2');
    record(trail, 'entry-3');
    await anchor.publish(checkpointFor(await trail.export())!);

    const truncated = (await trail.export()).slice(0, 1);
    const result = verifyAgainstCheckpoints(truncated, anchor.checkpoints());

    expect(result).toEqual({ ok: false, reason: 'TAIL_TRUNCATED', atSeq: 3 });
  });

  test('with no checkpoints nothing is claimed, and the gap is the whole trail', async () => {
    // Anchoring that was never published must not read as anchoring that held.
    const trail = createAuditTrail();
    record(trail, 'entry-1');
    record(trail, 'entry-2');

    expect(verifyAgainstCheckpoints(await trail.export(), [])).toEqual({
      ok: true,
      checkpointGap: 2,
      checkpointsChecked: 0,
    });
  });

  test('an empty trail yields no checkpoint to publish', async () => {
    const trail = createAuditTrail();

    expect(checkpointFor(await trail.export())).toBeNull();
  });

  test('a receipt carries the checkpoint it published, so the two cannot drift', async () => {
    const trail = createAuditTrail();
    record(trail, 'entry-1');

    const checkpoint = checkpointFor(await trail.export())!;
    const receipt = await createLocalAnchorLog().publish(checkpoint);

    expect(receipt.checkpoint).toEqual(checkpoint);
    expect(receipt.locator).toContain(checkpoint.headDigest.slice(0, 16));
  });
});
