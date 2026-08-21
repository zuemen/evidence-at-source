/**
 * M-of-N 社交金鑰復原。
 *
 * 這個專案把移工的一切繫在一把金鑰上：沒有那把金鑰，所有反簽都做不了，錢包裡的憑證
 * 全部變成看得到、用不了的東西。而這個族群**遺失手機的機率高得離譜**——被沒收、被摔壞、
 * 換宿舍、被遣返前被拿走。整套論述在那一刻歸零。
 *
 * 復原機制因此不是加分項，是缺了就不成立的一塊。
 *
 * 但它同時也是這個系統**最危險的一個功能**：能讓人拿回身分的機制，就是能讓人奪走身分的
 * 機制。所以這個檔案裡有一個測試是**證明攻擊會成功**的——M 個串通的保管人確實可以奪走
 * 這個身分。寫出來，不是為了假裝擋得住。
 */
import { describe, expect, test } from 'vitest';
import {
  MIN_RECOVERY_THRESHOLD,
  approveRecovery,
  createGuardianKey,
  verifyRecovery,
  type RecoveryPolicy,
  type RecoveryProposal,
} from '@eas/shared';

const WORKER = 'did:key:zWorker001';

/** Three guardians chosen by the worker; any two of them can act. */
function world() {
  const keys = ['alice', 'bello', 'chen'].map((name) => ({
    did: `did:key:zGuardian-${name}`,
    ...createGuardianKey(),
  }));

  const policy: RecoveryPolicy = {
    workerDid: WORKER,
    guardians: keys.map((k) => ({ did: k.did, publicKey: k.publicKey })),
    threshold: 2,
    epoch: 1,
    delayHours: 72,
  };

  return { keys, policy };
}

const PROPOSAL: RecoveryProposal = {
  workerDid: WORKER,
  newPublicKey: 'zNewDeviceKey000000000000000000000000000000',
  epoch: 1,
  proposedAt: '2026-08-01T00:00:00Z',
  nonce: 'synthetic-nonce-001',
};

/** Past the 72-hour delay. */
const AFTER = new Date('2026-08-05T00:00:00Z');

describe('門檻：M 個保管人才算數', () => {
  test('two of three guardians recover the identity', () => {
    const { keys, policy } = world();
    const approvals = keys
      .slice(0, 2)
      .map((k) => approveRecovery(k.secret, k.did, PROPOSAL));

    const result = verifyRecovery({ policy, proposal: PROPOSAL, approvals, asOf: AFTER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newPublicKey).toBe(PROPOSAL.newPublicKey);
    expect(result.approvals).toBe(2);
  });

  test('one of three does not', () => {
    const { keys, policy } = world();
    const approvals = [approveRecovery(keys[0]!.secret, keys[0]!.did, PROPOSAL)];

    const result = verifyRecovery({ policy, proposal: PROPOSAL, approvals, asOf: AFTER });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_THRESHOLD_NOT_MET');
  });

  test('the same guardian approving twice is still one guardian', () => {
    const { keys, policy } = world();
    const once = approveRecovery(keys[0]!.secret, keys[0]!.did, PROPOSAL);

    const result = verifyRecovery({
      policy,
      proposal: PROPOSAL,
      approvals: [once, once],
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_THRESHOLD_NOT_MET');
  });

  test('someone who is not a guardian does not count', () => {
    const { keys, policy } = world();
    const stranger = { did: 'did:key:zStranger', ...createGuardianKey() };

    const result = verifyRecovery({
      policy,
      proposal: PROPOSAL,
      approvals: [
        approveRecovery(keys[0]!.secret, keys[0]!.did, PROPOSAL),
        approveRecovery(stranger.secret, stranger.did, PROPOSAL),
      ],
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_THRESHOLD_NOT_MET');
  });

  test('a guardian DID cannot be claimed with someone else’s key', () => {
    // Signing under a guardian's name with a key that is not theirs.
    const { keys, policy } = world();
    const impostor = createGuardianKey();

    const result = verifyRecovery({
      policy,
      proposal: PROPOSAL,
      approvals: [
        approveRecovery(keys[0]!.secret, keys[0]!.did, PROPOSAL),
        approveRecovery(impostor.secret, keys[1]!.did, PROPOSAL),
      ],
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_THRESHOLD_NOT_MET');
  });
});

describe('綁定：一份同意只對一個提案有效', () => {
  test('an approval collected for one new key does not carry to another', () => {
    // Otherwise a guardian who once helped a worker recover has signed a blank
    // cheque: the same approval could be replayed to hand the identity to any
    // key at all.
    const { keys, policy } = world();
    const approvals = keys.slice(0, 2).map((k) => approveRecovery(k.secret, k.did, PROPOSAL));

    const substituted: RecoveryProposal = { ...PROPOSAL, newPublicKey: 'zAttackerKey0000000' };

    const result = verifyRecovery({ policy, proposal: substituted, approvals, asOf: AFTER });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_THRESHOLD_NOT_MET');
  });

  test('changing the guardian list retires every approval collected under the old one', () => {
    const { keys, policy } = world();
    const approvals = keys.slice(0, 2).map((k) => approveRecovery(k.secret, k.did, PROPOSAL));

    // The worker has since replaced a guardian, so the policy is at epoch 2.
    const updated: RecoveryPolicy = { ...policy, epoch: 2 };

    const result = verifyRecovery({ policy: updated, proposal: PROPOSAL, approvals, asOf: AFTER });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_EPOCH_STALE');
  });
});

describe('延遲與否決：唯一擋得住奪取的東西', () => {
  test('a complete proposal does not take effect immediately', () => {
    const { keys, policy } = world();
    const approvals = keys.slice(0, 2).map((k) => approveRecovery(k.secret, k.did, PROPOSAL));

    const result = verifyRecovery({
      policy,
      proposal: PROPOSAL,
      approvals,
      asOf: new Date('2026-08-01T06:00:00Z'),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_DELAY_NOT_ELAPSED');
  });

  test('the current key can veto during the window', () => {
    const { keys, policy } = world();
    const approvals = keys.slice(0, 2).map((k) => approveRecovery(k.secret, k.did, PROPOSAL));

    const result = verifyRecovery({
      policy,
      proposal: PROPOSAL,
      approvals,
      vetoed: true,
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_VETOED');
  });
});

describe('政策本身要合理', () => {
  test('a threshold of one is refused: that is a spare key, not recovery', () => {
    const { policy } = world();

    const result = verifyRecovery({
      policy: { ...policy, threshold: 1 },
      proposal: PROPOSAL,
      approvals: [],
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_POLICY_INVALID');
  });

  test('MIN_RECOVERY_THRESHOLD is at least two', () => {
    expect(MIN_RECOVERY_THRESHOLD).toBeGreaterThanOrEqual(2);
  });

  test('a threshold nobody could ever reach is refused', () => {
    const { keys, policy } = world();

    const result = verifyRecovery({
      policy: { ...policy, threshold: 4 },
      proposal: PROPOSAL,
      approvals: keys.map((k) => approveRecovery(k.secret, k.did, PROPOSAL)),
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_POLICY_INVALID');
  });

  test('a guardian listed twice cannot fill two slots', () => {
    const { keys, policy } = world();
    const duplicated: RecoveryPolicy = {
      ...policy,
      guardians: [policy.guardians[0]!, policy.guardians[0]!, policy.guardians[1]!],
    };

    const result = verifyRecovery({
      policy: duplicated,
      proposal: PROPOSAL,
      approvals: [approveRecovery(keys[0]!.secret, keys[0]!.did, PROPOSAL)],
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_POLICY_INVALID');
  });

  test('a proposal for a different worker is not this worker’s recovery', () => {
    const { keys, policy } = world();
    const other: RecoveryProposal = { ...PROPOSAL, workerDid: 'did:key:zWorker002' };

    const result = verifyRecovery({
      policy,
      proposal: other,
      approvals: keys.slice(0, 2).map((k) => approveRecovery(k.secret, k.did, other)),
      asOf: AFTER,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('RECOVERY_POLICY_INVALID');
  });
});

describe('誠實記錄：這個機制擋不住的事', () => {
  test('M colluding guardians take the identity, and nothing here stops them', () => {
    // Written as a passing test rather than a paragraph, because a limit stated
    // in prose gets read as a caveat and a limit stated as a test gets read as
    // a fact. Two guardians who agree with each other are indistinguishable
    // from two guardians helping a worker — the signatures are identical.
    //
    // The threshold buys one thing: more than one person has to be corrupted.
    // It does not buy safety. docs/key-recovery.md carries the rest.
    const { keys, policy } = world();
    const attackerKey = 'zBrokerControlledKey00000000000000000';
    const takeover: RecoveryProposal = { ...PROPOSAL, newPublicKey: attackerKey };

    const result = verifyRecovery({
      policy,
      proposal: takeover,
      approvals: keys.slice(0, 2).map((k) => approveRecovery(k.secret, k.did, takeover)),
      asOf: AFTER,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newPublicKey).toBe(attackerKey);
  });

  test('the veto only helps a worker who still holds their key and sees the notice', () => {
    // Which is exactly not the case in a real loss. The delay window protects
    // against takeover; it does nothing for the situation recovery exists for.
    const { keys, policy } = world();
    const approvals = keys.slice(0, 2).map((k) => approveRecovery(k.secret, k.did, PROPOSAL));

    // No veto arrives — a worker whose phone is gone cannot send one.
    const result = verifyRecovery({ policy, proposal: PROPOSAL, approvals, asOf: AFTER });

    expect(result.ok).toBe(true);
  });
});
