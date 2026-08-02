import { describe, expect, test } from 'vitest';
import { createRevocationRegistry, type PublicJwk } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { reviewDelegationForWallet } from '../src/wallet/reviewDelegation.js';

const AGENT_DID = 'did:key:zBankAgent';
const HELD_TYPES = ['DocumentCustodyCredential', 'WorkingHoursCredential'];

async function setup() {
  const bank = await createIssuer('did:web:bank.example');
  const knownInstitutions: Record<string, PublicJwk> = {
    'did:web:bank.example': bank.publicKey,
  };

  const delegation = (overrides: Partial<Parameters<typeof bank.issueDelegation>[0]> = {}) =>
    bank.issueDelegation({
      agentDid: AGENT_DID,
      principalName: '國泰世華銀行',
      allowedQueryTypes: ['boolean'],
      scope: ['DocumentCustodyCredential', 'WorkingHoursCredential'],
      purpose: '開戶申請的身份與意願查驗',
      ...overrides,
    });

  return { bank, knownInstitutions, delegation };
}

describe('wallet — delegation review before disclosure', () => {
  test('W1: a valid delegation shows details and allows disclosure', async () => {
    const { knownInstitutions, delegation } = await setup();
    const signed = await delegation();

    const view = await reviewDelegationForWallet(signed, {
      knownInstitutions,
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
    const { knownInstitutions, delegation } = await setup();
    const signed = await delegation({ lifetimeSeconds: -10 });

    const view = await reviewDelegationForWallet(signed, {
      knownInstitutions,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('refused');
    expect(view.status === 'refused' && view.reason).toBe('AGENT_DELEGATION_EXPIRED');
    expect(view.canDisclose).toBe(false);
  });

  test('W3: a revoked delegation shows a refusal and no disclosure', async () => {
    const { knownInstitutions, delegation } = await setup();
    const signed = await delegation();
    const revocations = createRevocationRegistry();
    revocations.revokeSubject(AGENT_DID);

    const view = await reviewDelegationForWallet(signed, {
      knownInstitutions,
      revocations,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('refused');
    expect(view.status === 'refused' && view.reason).toBe('AGENT_DELEGATION_REVOKED');
    expect(view.canDisclose).toBe(false);
  });

  test('W4: a held credential outside the delegation scope is marked not selectable', async () => {
    const { knownInstitutions, delegation } = await setup();
    // Scope covers only document custody; the worker also holds a working-hours
    // credential, which must be shown as out of scope.
    const signed = await delegation({ scope: ['DocumentCustodyCredential'] });

    const view = await reviewDelegationForWallet(signed, {
      knownInstitutions,
      heldCredentialTypes: HELD_TYPES,
    });

    expect(view.status).toBe('authorized');
    if (view.status !== 'authorized') return;
    expect(view.credentialsInScope).toEqual([
      { type: 'DocumentCustodyCredential', inScope: true },
      { type: 'WorkingHoursCredential', inScope: false },
    ]);
  });
});
