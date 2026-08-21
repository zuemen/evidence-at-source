/**
 * 任務 4：稽核紀錄要能重現「當時是用哪一版政策判的」，以及防重放放對層。
 */
import { describe, expect, test } from 'vitest';
import { POLICY_VERSION, currentPolicy, policyAt } from '@eas/shared';
import { createReplayGuard } from '@eas/agents';

describe('policyVersion：一年後還讀得懂當初那個數字', () => {
  test('the current policy carries every threshold the gate decides by', () => {
    const policy = currentPolicy();

    expect(policy.version).toBe(POLICY_VERSION);
    expect(policy.kAnonymity.rate).toBe(20);
    expect(policy.kAnonymity.minimum).toBe(5);
    expect(policy.queryBudget).toBeGreaterThan(0);
    expect(policy.reconciliationToleranceBps).toBeGreaterThan(0);
  });

  test('an old version still resolves to the numbers in force at the time', () => {
    // A receipt outlives the policy it was issued under. If a version stopped
    // resolving, every receipt citing it would become an unreadable number.
    expect(policyAt(POLICY_VERSION)?.kAnonymity.rate).toBe(20);
  });

  test('an unknown version resolves to nothing rather than to today’s numbers', () => {
    // Silently answering with the current parameters would be the worst
    // failure available: it reads as a successful lookup and is a lie.
    expect(policyAt('1999.01.1')).toBeUndefined();
  });

  test('每個政策版本都帶生效日', () => {
    expect(currentPolicy().effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('防重放：放在提問層，不是憑證層', () => {
  const AT = new Date('2026-08-01T00:00:00Z');

  test('a query id is answered once', () => {
    const guard = createReplayGuard();

    expect(guard.check('jti-001', AT).ok).toBe(true);
  });

  test('the same id a second time is refused', () => {
    const guard = createReplayGuard();
    guard.check('jti-001', AT);

    const second = guard.check('jti-001', AT);

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('QUERY_REPLAY_DETECTED');
  });

  test('different ids do not collide', () => {
    const guard = createReplayGuard();
    guard.check('jti-001', AT);

    expect(guard.check('jti-002', AT).ok).toBe(true);
  });

  test('ids are forgotten once the window passes, and answerable again', () => {
    const guard = createReplayGuard({ windowSeconds: 60 });
    guard.check('jti-001', AT);

    const later = new Date(AT.getTime() + 61_000);

    expect(guard.check('jti-001', later).ok).toBe(true);
  });

  test('an id inside the window is still refused', () => {
    const guard = createReplayGuard({ windowSeconds: 60 });
    guard.check('jti-001', AT);

    expect(guard.check('jti-001', new Date(AT.getTime() + 59_000)).ok).toBe(false);
  });

  test('記住的東西會被丟掉，不是留著不看', () => {
    // State not held cannot be handed over later under a different
    // justification — the same rule applicationMonitor follows.
    const guard = createReplayGuard({ windowSeconds: 60 });
    guard.check('jti-001', AT);

    expect(guard.size(AT)).toBe(1);
    expect(guard.size(new Date(AT.getTime() + 61_000))).toBe(0);
  });

  test('the window is at least as long as a delegation lives', () => {
    // A window shorter than the credential's life would leave a gap in which a
    // captured request becomes replayable again while its authorization is
    // still valid.
    expect(currentPolicy().replayWindowSeconds).toBeGreaterThanOrEqual(24 * 60 * 60);
  });

  test('the guard holds no query content and no worker reference', () => {
    // It remembers that an id was seen. Not what was asked, not about whom.
    const guard = createReplayGuard();
    guard.check('jti-001', AT);

    expect(Object.keys(guard).sort()).toEqual(['check', 'size']);
    expect(typeof guard.size(AT)).toBe('number');
  });
});
