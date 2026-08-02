import { describe, expect, test, vi } from 'vitest';
import { createRevocationRegistry, type PublicJwk } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { checkAgentDelegation, runAuthorizedGate, type DelegationContext } from '@eas/agents';

const AGENT_DID = 'did:key:zBankAgent';

async function setup() {
  const bank = await createIssuer('did:web:bank.example');
  const knownInstitutions: Record<string, PublicJwk> = {
    'did:web:bank.example': bank.publicKey,
  };

  async function delegation(overrides: Partial<Parameters<typeof bank.issueDelegation>[0]> = {}) {
    return bank.issueDelegation({
      agentDid: AGENT_DID,
      principalName: '國泰世華銀行',
      allowedQueryTypes: ['boolean'],
      scope: ['DocumentCustodyCredential', 'WorkingHoursCredential'],
      purpose: '開戶申請的身份與意願查驗',
      ...overrides,
    });
  }

  const baseCtx = (signed: string | null): DelegationContext => ({
    signedDelegation: signed,
    requestedQueryType: 'boolean',
    requestedCredentialType: 'WorkingHoursCredential',
    knownInstitutions,
  });

  return { bank, knownInstitutions, delegation, baseCtx };
}

describe('L0 — agent delegation', () => {
  test('D1: a missing delegation is refused and no worker data is touched', async () => {
    const { baseCtx } = await setup();
    const workerReader = vi.fn(async () => ({ ok: true }) as const);

    const result = await runAuthorizedGate(baseCtx(null), workerReader);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('AGENT_DELEGATION_MISSING');
    expect(workerReader).not.toHaveBeenCalled();
  });

  test('D2: an expired delegation is refused', async () => {
    const { delegation, baseCtx } = await setup();
    const expired = await delegation({ lifetimeSeconds: -10 });

    const decision = await checkAgentDelegation(baseCtx(expired));

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('AGENT_DELEGATION_EXPIRED');
  });

  test('D3: a delegation the institution revoked is refused', async () => {
    const { delegation, baseCtx } = await setup();
    const signed = await delegation();
    const revocations = createRevocationRegistry();
    revocations.revokeSubject(AGENT_DID);

    const decision = await checkAgentDelegation({ ...baseCtx(signed), revocations });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('AGENT_DELEGATION_REVOKED');
  });

  test('D4: a credential type outside the delegation scope is refused', async () => {
    const { delegation, baseCtx } = await setup();
    const signed = await delegation({ scope: ['DocumentCustodyCredential'] });

    const decision = await checkAgentDelegation({
      ...baseCtx(signed),
      requestedCredentialType: 'WorkingHoursCredential',
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('CREDENTIAL_TYPE_NOT_IN_SCOPE');
  });

  test('D5: a query type outside allowedQueryTypes is refused', async () => {
    const { delegation, baseCtx } = await setup();
    const signed = await delegation({ allowedQueryTypes: ['boolean'] });

    const decision = await checkAgentDelegation({
      ...baseCtx(signed),
      requestedQueryType: 'aggregate',
    });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('QUERY_TYPE_NOT_IN_SCOPE');
  });

  test('a delegation signed by an unknown institution is invalid', async () => {
    const { delegation, baseCtx } = await setup();
    const signed = await delegation();

    const decision = await checkAgentDelegation({ ...baseCtx(signed), knownInstitutions: {} });

    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toBe('AGENT_DELEGATION_INVALID');
  });

  test('D6: a valid, in-scope delegation is authorized and existing behaviour runs', async () => {
    const { delegation, baseCtx } = await setup();
    const signed = await delegation();
    const workerReader = vi.fn(async () => ({ ok: true, conclusion: false }) as const);

    const result = await runAuthorizedGate(baseCtx(signed), workerReader);

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.claims.agentDid).toBe(AGENT_DID);
    expect(result.ok === true && result.claims.principalName).toBe('國泰世華銀行');
    expect(workerReader).toHaveBeenCalledTimes(1);
  });

  test('D7: when L0 fails, the worker-credential reader is never called', async () => {
    const { delegation, baseCtx } = await setup();
    // A validly-signed delegation, but the requested query type is out of scope,
    // so L0 must refuse before any worker data is read.
    const signed = await delegation({ allowedQueryTypes: ['boolean'] });
    const workerReader = vi.fn(async () => ({ ok: true }) as const);

    const result = await runAuthorizedGate(
      { ...baseCtx(signed), requestedQueryType: 'aggregate' },
      workerReader,
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('QUERY_TYPE_NOT_IN_SCOPE');
    expect(workerReader).not.toHaveBeenCalled();
  });
});
