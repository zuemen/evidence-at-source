import { describe, expect, test } from 'vitest';
import { bootstrapEcosystem, isValidLei, verifyEcrChain, verifyLeChain } from '@eas/vlei';
import { verifyPresentation, type PublicJwk } from '@eas/shared';
import { createVleiIssuer } from '@eas/issuer';

async function setup() {
  const eco = bootstrapEcosystem();
  const bank = await createVleiIssuer({
    didWeb: 'did:web:bank.example',
    legalName: '國泰世華銀行',
    leiTag: 'BANKEXAMPLE',
    ecosystem: eco,
  });
  return { eco, bank };
}

describe('createVleiIssuer', () => {
  test('the issuer carries a valid synthetic LEI and a verifiable LE chain', async () => {
    const { eco, bank } = await setup();

    expect(isValidLei(bank.lei)).toBe(true);
    const verdict = verifyLeChain(bank.legalEntityPresentation(), eco.trust);
    expect(verdict.ok).toBe(true);
  });

  test('the LE credential publishes the issuer SD-JWT public key', async () => {
    const { eco, bank } = await setup();
    const verdict = verifyLeChain(bank.legalEntityPresentation(), eco.trust);

    expect(verdict.ok && verdict.facts.credentialSigningJwk).toEqual(bank.publicKey);
  });

  test('a delegation it signs verifies against the chain-resolved key', async () => {
    const { eco, bank } = await setup();
    const signed = await bank.issueDelegation({
      agentDid: 'did:key:zBankAgent',
      principalName: '國泰世華銀行',
      allowedQueryTypes: ['boolean'],
      scope: ['DocumentCustodyCredential'],
      purpose: '開戶申請的身份與意願查驗',
    });

    const verdict = verifyLeChain(bank.legalEntityPresentation(), eco.trust);
    if (!verdict.ok) throw new Error('chain must verify');
    const key = verdict.facts.credentialSigningJwk as PublicJwk;
    const { payload } = await verifyPresentation(signed, key);

    expect(payload['principal']).toBe('did:web:bank.example');
  });

  test('grantAgentEcr issues a verifiable ECR chain and revokeAgentEcr kills it', async () => {
    const { eco, bank } = await setup();
    const p = bank.grantAgentEcr('did:key:zBankAgent');

    expect(verifyEcrChain(p, eco.trust).ok).toBe(true);
    bank.revokeAgentEcr('did:key:zBankAgent');
    expect(verifyEcrChain(p, eco.trust)).toEqual({ ok: false, failure: 'REGISTRY_REVOKED' });
  });

  test('revokeLegalEntityCredential kills the LE chain itself', async () => {
    const { eco, bank } = await setup();
    const p = bank.legalEntityPresentation();

    expect(verifyLeChain(p, eco.trust).ok).toBe(true);
    bank.revokeLegalEntityCredential();
    expect(verifyLeChain(p, eco.trust)).toEqual({ ok: false, failure: 'REGISTRY_REVOKED' });
  });
});
