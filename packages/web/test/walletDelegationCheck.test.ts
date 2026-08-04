import { describe, expect, test } from 'vitest';
import { createRevocationRegistry } from '@eas/shared';
import { bootstrapEcosystem } from '@eas/vlei';
import { createVleiIssuer } from '@eas/issuer';
import { reviewDelegationForWallet } from '../src/wallet/reviewDelegation.js';

const AGENT_DID = 'did:key:zBankAgent';
const HELD_TYPES = ['DocumentCustodyCredential', 'WorkingHoursCredential'];

async function setup() {
  const eco = bootstrapEcosystem();
  const bank = await createVleiIssuer({
    didWeb: 'did:web:bank.example',
    legalName: '國泰世華銀行',
    leiTag: 'BANKEXAMPLE',
    ecosystem: eco,
  });
  const agentVlei = bank.grantAgentEcr(AGENT_DID);

  const delegation = (overrides: Partial<Parameters<typeof bank.issueDelegation>[0]> = {}) =>
    bank.issueDelegation({
      agentDid: AGENT_DID,
      principalName: '國泰世華銀行',
      allowedQueryTypes: ['boolean'],
      scope: ['DocumentCustodyCredential', 'WorkingHoursCredential'],
      purpose: '開戶申請的身份與意願查驗',
      ...overrides,
    });

  return { eco, bank, agentVlei, trust: eco.trust, delegation };
}

describe('wallet — delegation review before disclosure', () => {
  test('W1: a valid delegation shows details and allows disclosure', async () => {
    const { agentVlei, trust, delegation } = await setup();
    const signed = await delegation();

    const view = await reviewDelegationForWallet(signed, {
      agentVlei,
      trust,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('authorized');
    if (view.status !== 'authorized') return;
    expect(view.canDisclose).toBe(true);
    expect(view.principalName).toBe('國泰世華銀行');
    expect(view.purpose).toBe('開戶申請的身份與意願查驗');
    expect(view.remainingSeconds).toBeGreaterThan(0);
    expect(view.credentialsInScope).toEqual([
      { type: 'DocumentCustodyCredential', inScope: true },
      { type: 'WorkingHoursCredential', inScope: true },
    ]);
  });

  test('W2: an expired delegation shows a refusal and no disclosure', async () => {
    const { agentVlei, trust, delegation } = await setup();
    const signed = await delegation({ lifetimeSeconds: -10 });

    const view = await reviewDelegationForWallet(signed, {
      agentVlei,
      trust,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('refused');
    expect(view.status === 'refused' && view.reason).toBe('AGENT_DELEGATION_EXPIRED');
    expect(view.canDisclose).toBe(false);
  });

  test('W3: a revoked delegation shows a refusal and no disclosure', async () => {
    const { agentVlei, trust, delegation } = await setup();
    const signed = await delegation();
    const revocations = createRevocationRegistry();
    revocations.revokeSubject(AGENT_DID);

    const view = await reviewDelegationForWallet(signed, {
      agentVlei,
      trust,
      revocations,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('refused');
    expect(view.status === 'refused' && view.reason).toBe('AGENT_DELEGATION_REVOKED');
    expect(view.canDisclose).toBe(false);
  });

  test('W4: a held credential outside the delegation scope is marked not selectable', async () => {
    const { agentVlei, trust, delegation } = await setup();
    // Scope covers only document custody; the worker also holds a working-hours
    // credential, which must be shown as out of scope.
    const signed = await delegation({ scope: ['DocumentCustodyCredential'] });

    const view = await reviewDelegationForWallet(signed, {
      agentVlei,
      trust,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('authorized');
    if (view.status !== 'authorized') return;
    expect(view.credentialsInScope).toEqual([
      { type: 'DocumentCustodyCredential', inScope: true },
      { type: 'WorkingHoursCredential', inScope: false },
    ]);
  });

  test('W5: the wallet shows the vLEI-verified legal entity, and a revoked ECR refuses', async () => {
    const { bank, agentVlei, trust, delegation } = await setup();
    const signed = await delegation();

    const view = await reviewDelegationForWallet(signed, {
      agentVlei,
      trust,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('authorized');
    if (view.status === 'authorized') {
      expect(view.verifiedLegalEntity.legalName).toBe('國泰世華銀行');
      expect(view.verifiedLegalEntity.lei.startsWith('BANKEXAMPLE')).toBe(true);
    }

    bank.revokeAgentEcr(AGENT_DID);
    const after = await reviewDelegationForWallet(signed, {
      agentVlei,
      trust,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(after.status === 'refused' && after.reason).toBe('AGENT_VLEI_REVOKED');
  });
});
