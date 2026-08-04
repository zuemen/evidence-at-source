import { describe, expect, test, vi } from 'vitest';
import { createRevocationRegistry } from '@eas/shared';
import { createVleiIssuer } from '@eas/issuer';
import { checkAgentDelegation, runAuthorizedGate, type DelegationContext } from '@eas/agents';
import { AGENT_DID, setupVleiWorld } from './helpers/vleiWorld.js';

async function setup() {
  const world = await setupVleiWorld();

  async function delegation(
    overrides: Partial<Parameters<typeof world.bank.issueDelegation>[0]> = {},
  ) {
    return world.bank.issueDelegation({
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
    agentVlei: world.agentVlei,
    trust: world.trust,
    requestedQueryType: 'boolean',
    requestedCredentialType: 'WorkingHoursCredential',
  });

  return { ...world, delegation, baseCtx };
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

  test('a delegation signed by a key outside the vLEI chain is invalid', async () => {
    const { eco, baseCtx } = await setup();
    // An impostor institution in the same ecosystem signs the delegation, but
    // the presented ECR chain belongs to the real bank — the chain-resolved key
    // does not verify the impostor's signature.
    const impostor = await createVleiIssuer({
      didWeb: 'did:web:bank.example',
      legalName: '假冒銀行',
      leiTag: 'IMPOSTOREXAMPLE',
      ecosystem: eco,
    });
    const signed = await impostor.issueDelegation({
      agentDid: AGENT_DID,
      principalName: '國泰世華銀行',
      allowedQueryTypes: ['boolean'],
      scope: ['WorkingHoursCredential'],
      purpose: '開戶申請的身份與意願查驗',
    });

    const decision = await checkAgentDelegation(baseCtx(signed));

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

describe('L0 — agent vLEI authority', () => {
  test('V1: no ECR chain presented is refused before any worker data', async () => {
    const { delegation, baseCtx } = await setup();
    const signed = await delegation();
    const workerReader = vi.fn(async () => ({ ok: true }) as const);

    const result = await runAuthorizedGate({ ...baseCtx(signed), agentVlei: null }, workerReader);

    expect(result.ok === false && result.reason).toBe('AGENT_VLEI_MISSING');
    expect(workerReader).not.toHaveBeenCalled();
  });

  test('V2: a revoked ECR is refused as AGENT_VLEI_REVOKED', async () => {
    const { bank, delegation, baseCtx } = await setup();
    const signed = await delegation();
    bank.revokeAgentEcr(AGENT_DID);

    const decision = await checkAgentDelegation(baseCtx(signed));

    expect(decision.ok === false && decision.reason).toBe('AGENT_VLEI_REVOKED');
  });

  test('V3: a delegation naming a different agent than the ECR is a binding mismatch', async () => {
    const { delegation, baseCtx } = await setup();
    const signed = await delegation({ agentDid: 'did:key:zSomeoneElse' });

    const decision = await checkAgentDelegation(baseCtx(signed));

    expect(decision.ok === false && decision.reason).toBe('AGENT_VLEI_BINDING_MISMATCH');
  });

  test('V4: a passing decision carries the verified authority facts', async () => {
    const { delegation, baseCtx } = await setup();
    const decision = await checkAgentDelegation(baseCtx(await delegation()));

    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.authority.principalDid).toBe('did:web:bank.example');
      expect(decision.authority.principalLegalName).toBe('國泰世華銀行');
    }
  });
});
