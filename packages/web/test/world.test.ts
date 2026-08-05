import { describe, expect, test } from 'vitest';
import { importVerifierContext, verifyEcrChain } from '@eas/vlei';
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
    expect(split.brand.answer?.ok).toBe(true);
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
    expect(split.brand.answer?.ok).toBe(true);
  });

  test('revoking the bank agent delegation fails its side at L0 and reads no worker data', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    world.revokeAgentDelegation('bank');
    const split = await world.split();

    expect(split.bank.refusedWith).toBe('AGENT_DELEGATION_REVOKED');
    // L0 refused before any credential was read.
    expect(Object.keys(split.bank.disclosed)).toHaveLength(0);
    expect(split.bank.assessment).toBeNull();
    // The brand agent is unaffected by the bank agent's revocation.
    expect(split.brand.answer?.ok).toBe(true);
  });

  test('delegationState reflects revocation and flips the wallet review to refused', async () => {
    const world = await createDemoWorld();

    const before = await world.delegationState();
    expect(before.agents.find((a) => a.role === 'bank')?.status).toBe('valid');
    expect(before.walletReview.status).toBe('authorized');

    world.revokeAgentDelegation('bank');
    const after = await world.delegationState();

    expect(after.agents.find((a) => a.role === 'bank')?.status).toBe('revoked');
    expect(after.walletReview.status).toBe('refused');
  });

  test('vleiState reports intact chains for both agents and all four issuers', async () => {
    const world = await createDemoWorld();

    const vlei = world.vleiState();

    expect(vlei.qviRevoked).toBe(false);
    expect(vlei.chains).toHaveLength(2);
    expect(vlei.chains.every((chain) => chain.verified)).toBe(true);
    expect(vlei.chains.every((chain) => chain.nodes.length === 4)).toBe(true);
    expect(vlei.issuers).toHaveLength(4);
    expect(vlei.issuers.every((issuer) => issuer.verified)).toBe(true);
  });

  test('revoking the QVI collapses every chain and refuses both agents at L0', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    world.revokeQvi();

    const vlei = world.vleiState();
    expect(vlei.qviRevoked).toBe(true);
    expect(vlei.chains.every((chain) => chain.verified === false)).toBe(true);
    expect(vlei.issuers.every((issuer) => issuer.verified === false)).toBe(true);

    const split = await world.split();
    expect(split.bank.refusedWith).toBe('AGENT_VLEI_REVOKED');
    expect(Object.keys(split.bank.disclosed)).toHaveLength(0);
    expect(split.brand.refusedWith).toBe('AGENT_VLEI_REVOKED');

    const delegation = await world.delegationState();
    expect(delegation.agents.every((agent) => agent.status === 'revoked')).toBe(true);
    expect(delegation.walletReview.status).toBe('refused');
  });

  test('the demo world exposes the working-hours issuer tier for display', async () => {
    const world = await createDemoWorld();
    const split = await world.split();

    expect(['SELF_DECLARED', 'THIRD_PARTY_VERIFIED', 'AUTHORITY_CERTIFIED']).toContain(
      split.brand.workingHoursIssuerTier,
    );
  });

  test('the exported agent bundle verifies in a rebuilt context pinned to the demo root', async () => {
    const world = await createDemoWorld();
    const vlei = world.vleiState();

    expect(vlei.root).toEqual({ keyCount: 3, threshold: 2 });

    const wire = world.exportAgentBundle('bank');
    const imported = importVerifierContext(wire, new Set([vlei.gleifAid]));

    expect(verifyEcrChain(imported.presentation, imported.trust).ok).toBe(true);
  });
});
