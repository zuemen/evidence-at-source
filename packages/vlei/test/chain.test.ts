import { describe, expect, test } from 'vitest';
import {
  AI_AGENT_ROLE,
  bootstrapEcosystem,
  isValidLei,
  verifyEcrChain,
  verifyLeChain,
} from '@eas/vlei';

const JWK = { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' };

function bank(eco = bootstrapEcosystem()) {
  return {
    eco,
    le: eco.createLegalEntity({
      legalName: '國泰世華銀行',
      didWeb: 'did:web:bank.example',
      leiTag: 'BANKEXAMPLE',
      signingJwk: JWK,
    }),
  };
}

describe('vLEI trust chain', () => {
  test('a legal entity chain verifies down to the GLEIF root and exposes its facts', () => {
    const { eco, le } = bank();
    const verdict = verifyLeChain(le.presentation(), eco.trust);

    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.facts.didWeb).toBe('did:web:bank.example');
      expect(verdict.facts.legalName).toBe('國泰世華銀行');
      expect(verdict.facts.credentialSigningJwk).toEqual(JWK);
      expect(isValidLei(verdict.facts.lei)).toBe(true);
    }
  });

  test('an ECR chain verifies and binds agentDid, role and the LEI of its legal entity', () => {
    const { eco, le } = bank();
    const verdict = verifyEcrChain(le.grantEcr('did:key:zBankAgent'), eco.trust);

    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.facts.agentDid).toBe('did:key:zBankAgent');
      expect(verdict.facts.role).toBe(AI_AGENT_ROLE);
      expect(verdict.facts.lei).toBe(verdict.facts.legalEntity.lei);
    }
  });

  test('an unexpected role is refused', () => {
    const { eco, le } = bank();
    const p = le.grantEcr('did:key:zBankAgent', 'coffee-runner');

    expect(verifyEcrChain(p, eco.trust)).toEqual({ ok: false, failure: 'ROLE_MISMATCH' });
  });

  test('revoking the ECR kills only that agent authority', () => {
    const { eco, le } = bank();
    const p = le.grantEcr('did:key:zBankAgent');
    le.revokeEcr('did:key:zBankAgent');

    expect(verifyEcrChain(p, eco.trust)).toEqual({ ok: false, failure: 'REGISTRY_REVOKED' });
    expect(verifyLeChain(le.presentation(), eco.trust).ok).toBe(true);
  });

  test('revoking the LE credential cascades to its agents', () => {
    const { eco, le } = bank();
    const p = le.grantEcr('did:key:zBankAgent');
    le.revokeCredential();

    expect(verifyLeChain(le.presentation(), eco.trust).ok).toBe(false);
    expect(verifyEcrChain(p, eco.trust)).toEqual({ ok: false, failure: 'REGISTRY_REVOKED' });
  });

  test('revoking the QVI credential collapses the whole ecosystem', () => {
    const { eco, le } = bank();
    const p = le.grantEcr('did:key:zBankAgent');
    eco.revokeQviCredential();

    expect(verifyLeChain(le.presentation(), eco.trust)).toEqual({
      ok: false,
      failure: 'REGISTRY_REVOKED',
    });
    expect(verifyEcrChain(p, eco.trust).ok).toBe(false);
  });

  test('a chain from a foreign ecosystem is refused against our trust context', () => {
    const ours = bank();
    const theirs = bank(bootstrapEcosystem());
    const p = theirs.le.grantEcr('did:key:zBankAgent');

    expect(verifyEcrChain(p, ours.eco.trust).ok).toBe(false);
  });

  test('a presentation missing the qvi credential fails with EDGE_MISSING', () => {
    const { eco, le } = bank();
    const p = le.presentation();
    const focusCred = p.credentials[p.focus];
    const pruned = { focus: p.focus, credentials: { [p.focus]: focusCred } };

    expect(verifyLeChain(pruned, eco.trust)).toEqual({ ok: false, failure: 'EDGE_MISSING' });
  });
});

describe('multisig GLEIF root', () => {
  test('the root is 2-of-3 and every chain still verifies against it', () => {
    const { eco, le } = bank();

    expect(eco.gleifKeyState.keys).toHaveLength(3);
    expect(eco.gleifKeyState.threshold).toBe(2);
    expect(verifyEcrChain(le.grantEcr('did:key:zBankAgent'), eco.trust).ok).toBe(true);

    eco.revokeQviCredential();
    expect(verifyLeChain(le.presentation(), eco.trust).ok).toBe(false);
  });
});
