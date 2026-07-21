import { describe, expect, test } from 'vitest';
import { createDemoWorld } from '@eas/web';

describe('demo world', () => {
  test('starts with every credential awaiting the worker counter-signature', async () => {
    const world = await createDemoWorld();

    const snapshot = world.snapshot();

    expect(snapshot.credentials).toHaveLength(4);
    expect(snapshot.credentials.every((c) => c.attested === false)).toBe(true);
  });

  test('hidden fields shown in the wallet come from the schema, not from guesswork', async () => {
    const world = await createDemoWorld();

    const cards = world.snapshot().credentials;
    const hours = cards.find((c) => c.type === 'WorkingHoursCredential');
    const fee = cards.find((c) => c.type === 'RecruitmentFeeCredential');

    // Public conclusions must never be drawn as redacted in the UI.
    expect(hours?.hiddenFields).toEqual(['totalHours', 'overtimeHours']);
    expect(fee?.hiddenFields).toEqual(['feeAmount', 'paymentSchedule', 'lenderName']);
  });

  test('an un-attested credential is refused: the employer alone is not enough', async () => {
    const world = await createDemoWorld();

    const split = await world.split();

    expect(split.bank.refusedWith).toBe('MISSING_WORKER_ATTESTATION');
  });

  test('once attested, the bank gets a recommendation and the brand gets a rate', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    const split = await world.split();

    expect(split.bank.refusedWith).toBeNull();
    expect(split.bank.assessment?.recommendation).toBe('APPROVE_PENDING_HUMAN_REVIEW');
    expect(split.bank.assessment?.requiresHumanReview).toBe(true);
    expect(split.brand.answer.ok).toBe(true);
  });

  test('neither side ever receives a raw value', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    const split = await world.split();
    const serialised = JSON.stringify(split);

    // 186 hours, 42 overtime and the fee amount must not appear anywhere.
    expect(serialised).not.toContain('186');
    expect(serialised).not.toContain('overtimeHours');
    expect(serialised).not.toContain('feeAmount');
    expect(split.bank.disclosed['totalHours']).toBeUndefined();
  });

  test('revoking the subject stops both views at once', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    world.revokeSubject();
    const split = await world.split();

    expect(split.bank.refusedWith).toBe('CREDENTIAL_REVOKED');
    expect(split.brand.rejected).toContain('CREDENTIAL_REVOKED');
  });

  test('a revoked worker does not remove the rest of the cohort', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    world.revokeSubject();
    const split = await world.split();

    // The other workers' evidence is untouched, so the brand still gets an answer.
    expect(split.brand.answer.ok).toBe(true);
  });
});
