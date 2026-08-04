import { describe, expect, test } from 'vitest';
import { bootstrapEcosystem } from '@eas/vlei';
import { resolveAgentAuthority, resolveIssuerSigningKey } from '@eas/agents';

const JWK = { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' };
const AGENT_DID = 'did:key:zBankAgent';

function setup() {
  const eco = bootstrapEcosystem();
  const le = eco.createLegalEntity({
    legalName: '國泰世華銀行',
    didWeb: 'did:web:bank.example',
    leiTag: 'BANKEXAMPLE',
    signingJwk: JWK,
  });
  return { eco, le };
}

describe('vleiBridge', () => {
  test('a valid ECR chain resolves to an agent authority with the delegation JWK', () => {
    const { eco, le } = setup();
    const resolved = resolveAgentAuthority(le.grantEcr(AGENT_DID), eco.trust);

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.authority.agentDid).toBe(AGENT_DID);
      expect(resolved.authority.principalDid).toBe('did:web:bank.example');
      expect(resolved.authority.principalLegalName).toBe('國泰世華銀行');
      expect(resolved.authority.delegationJwk).toEqual(JWK);
    }
  });

  test('a revoked ECR maps to AGENT_VLEI_REVOKED', () => {
    const { eco, le } = setup();
    const p = le.grantEcr(AGENT_DID);
    le.revokeEcr(AGENT_DID);

    expect(resolveAgentAuthority(p, eco.trust)).toEqual({
      ok: false,
      reason: 'AGENT_VLEI_REVOKED',
    });
  });

  test('a chain from a foreign ecosystem maps to AGENT_VLEI_CHAIN_INVALID', () => {
    const ours = setup();
    const theirs = setup();

    expect(resolveAgentAuthority(theirs.le.grantEcr(AGENT_DID), ours.eco.trust)).toEqual({
      ok: false,
      reason: 'AGENT_VLEI_CHAIN_INVALID',
    });
  });

  test('a valid LE chain resolves the issuer signing key', () => {
    const { eco, le } = setup();
    const resolved = resolveIssuerSigningKey(le.presentation(), eco.trust);

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.issuer.didWeb).toBe('did:web:bank.example');
      expect(resolved.issuer.jwk).toEqual(JWK);
    }
  });

  test('a revoked LE credential maps to ISSUER_VLEI_REVOKED', () => {
    const { eco, le } = setup();
    const p = le.presentation();
    le.revokeCredential();

    expect(resolveIssuerSigningKey(p, eco.trust)).toEqual({
      ok: false,
      reason: 'ISSUER_VLEI_REVOKED',
    });
  });
});
