import { describe, expect, test } from 'vitest';
import {
  CredentialRegistry,
  KelStore,
  TelStore,
  createAid,
  issueAcdc,
  verifyAcdc,
  type SignedAcdc,
} from '@eas/vlei';

function setup() {
  const kels = new KelStore();
  const tels = new TelStore(kels);
  const issuer = createAid();
  kels.register(issuer.kel);
  const registry = new CredentialRegistry(issuer);
  tels.register(registry);
  return { kels, tels, issuer, registry, trust: { kels, tels } };
}

function issueQvi(world: ReturnType<typeof setup>): SignedAcdc {
  return issueAcdc({
    issuer: world.issuer,
    registry: world.registry,
    schema: 'qvi',
    subject: 'E' + 'Q'.repeat(43),
    claims: { LEI: 'QVIEXAMPLEXXXXXXXX00' },
  });
}

describe('ACDC issue and verify', () => {
  test('a freshly issued credential verifies and is issued in its registry', () => {
    const world = setup();
    const signed = issueQvi(world);

    expect(verifyAcdc(signed, world.trust)).toEqual({ ok: true });
    expect(world.tels.status(signed.acdc.ri, signed.acdc.d)).toBe('issued');
  });

  test('tampering with an attribute is caught as SAID_MISMATCH', () => {
    const world = setup();
    const signed = issueQvi(world);
    const tampered: SignedAcdc = {
      ...signed,
      acdc: { ...signed.acdc, a: { ...signed.acdc.a, LEI: 'FORGEDLEIXXXXXXXXX00' } },
    };

    expect(verifyAcdc(tampered, world.trust)).toEqual({ ok: false, failure: 'SAID_MISMATCH' });
  });

  test('an unknown schema said is refused', () => {
    const world = setup();
    const signed = issueQvi(world);
    const resaid = { ...signed.acdc, s: 'E' + 'Z'.repeat(43) };

    const verdict = verifyAcdc({ ...signed, acdc: resaid }, world.trust);
    expect(verdict.ok).toBe(false);
  });

  test('revocation surfaces as REGISTRY_REVOKED', () => {
    const world = setup();
    const signed = issueQvi(world);
    world.registry.revoke(signed.acdc.d);

    expect(verifyAcdc(signed, world.trust)).toEqual({ ok: false, failure: 'REGISTRY_REVOKED' });
  });

  test('missing required attributes are refused as ATTRIBUTE_INVALID', () => {
    const world = setup();
    const signed = issueAcdc({
      issuer: world.issuer,
      registry: world.registry,
      schema: 'ecr',
      subject: 'did:key:zBankAgent',
      claims: { LEI: 'BANKEXAMPLEXXXXXXX00' },
    });

    expect(verifyAcdc(signed, world.trust)).toEqual({ ok: false, failure: 'ATTRIBUTE_INVALID' });
  });

  test('a credential signed before key rotation still verifies via sigSeq', () => {
    const world = setup();
    const signed = issueQvi(world);
    world.issuer.rotate();

    expect(verifyAcdc(signed, world.trust)).toEqual({ ok: true });
  });

  test('a signature from a key the KEL never established is refused', () => {
    const world = setup();
    const signed = issueQvi(world);
    const stranger = setup();
    const forged: SignedAcdc = { ...signed, sigs: issueQvi(stranger).sigs };

    expect(verifyAcdc(forged, world.trust)).toEqual({ ok: false, failure: 'SIGNATURE_INVALID' });
  });
});
