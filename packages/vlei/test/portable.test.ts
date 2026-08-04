import { describe, expect, test } from 'vitest';
import {
  bootstrapEcosystem,
  exportChainArtifacts,
  importVerifierContext,
  verifyEcrChain,
  type ChainArtifacts,
} from '@eas/vlei';

const JWK = { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' };
const AGENT_DID = 'did:key:zBankAgent';

function world() {
  const eco = bootstrapEcosystem();
  const le = eco.createLegalEntity({
    legalName: '國泰世華銀行',
    didWeb: 'did:web:bank.example',
    leiTag: 'BANKEXAMPLE',
    signingJwk: JWK,
  });
  return { eco, le, chain: le.grantEcr(AGENT_DID) };
}

describe('portable chain artifacts', () => {
  test('a wire-serialized presentation verifies in a rebuilt context', () => {
    const { eco, chain } = world();
    const wire = exportChainArtifacts(chain, eco.trust);

    const imported = importVerifierContext(wire, eco.trust.trustedRoots);
    const verdict = verifyEcrChain(imported.presentation, imported.trust);

    expect(typeof wire).toBe('string');
    expect(verdict.ok).toBe(true);
  });

  test('revocation state travels inside the bundle', () => {
    const { eco, le, chain } = world();
    le.revokeEcr(AGENT_DID);
    const wire = exportChainArtifacts(chain, eco.trust);

    const imported = importVerifierContext(wire, eco.trust.trustedRoots);

    expect(verifyEcrChain(imported.presentation, imported.trust)).toEqual({
      ok: false,
      failure: 'REGISTRY_REVOKED',
    });
  });

  test('an on-the-wire credential tamper is caught after import', () => {
    const { eco, chain } = world();
    const artifacts = JSON.parse(exportChainArtifacts(chain, eco.trust)) as ChainArtifacts;
    const focus = artifacts.presentation.credentials[artifacts.presentation.focus]!;
    (focus.acdc.a as Record<string, unknown>)['agentDid'] = 'did:key:zEvilAgent';

    const imported = importVerifierContext(JSON.stringify(artifacts), eco.trust.trustedRoots);

    expect(verifyEcrChain(imported.presentation, imported.trust)).toEqual({
      ok: false,
      failure: 'SAID_MISMATCH',
    });
  });

  test('a tampered KEL inside the bundle is rejected at import', () => {
    const { eco, chain } = world();
    const artifacts = JSON.parse(exportChainArtifacts(chain, eco.trust)) as ChainArtifacts;
    const someAid = Object.keys(artifacts.kels)[0]!;
    const kel = artifacts.kels[someAid]! as unknown as { event: { s: string } }[];
    kel[0]!.event.s = 'f';

    expect(() => importVerifierContext(JSON.stringify(artifacts), eco.trust.trustedRoots)).toThrow();
  });

  test('a bundle verified against someone else’s root is refused', () => {
    const { eco, chain } = world();
    const wire = exportChainArtifacts(chain, eco.trust);

    const imported = importVerifierContext(wire, new Set(['E' + 'Q'.repeat(43)]));

    expect(verifyEcrChain(imported.presentation, imported.trust)).toEqual({
      ok: false,
      failure: 'ROOT_UNTRUSTED',
    });
  });
});
