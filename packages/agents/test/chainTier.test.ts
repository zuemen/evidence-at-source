import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import type { IssuerTier } from '@eas/shared';
import { bootstrapEcosystem } from '@eas/vlei';
import { createIssuer, createVleiIssuer, type Issuer } from '@eas/issuer';
import { checkCredentialLayer, chainTierOf, requireIssuerSigningKey } from '@eas/agents';

const WORKER_DID = 'did:key:zWorker001';

const CLAIMS = {
  workerDID: WORKER_DID,
  withinRBALimit: true,
  periodStart: '2026-08-01',
  totalHours: 186,
  overtimeHours: 42,
};

/** An issuer whose chain and whose credentials agree, which is the normal case. */
async function honest(tier: IssuerTier | undefined) {
  const eco = bootstrapEcosystem();
  const factory = await createVleiIssuer({
    didWeb: 'did:web:factory.example',
    legalName: '工廠打卡系統',
    leiTag: 'FACTORYEXAMPLE',
    ecosystem: eco,
    ...(tier === undefined ? {} : { options: { tier } }),
  });

  return bundle(factory, requireIssuerSigningKey(factory.legalEntityPresentation(), eco.trust));
}

/**
 * An issuer that signs credentials claiming `claimed` while its QVI only
 * granted `granted`.
 *
 * Built by registering the Legal Entity by hand rather than through
 * createVleiIssuer, because the honest path deliberately writes the same tier
 * to both places. The two cannot be made to disagree by accident — which is
 * why the disagreement has to be constructed to be tested at all.
 */
async function overclaiming(granted: IssuerTier, claimed: IssuerTier) {
  const eco = bootstrapEcosystem();
  const base = await createIssuer('did:web:factory.example', { tier: claimed });
  const entity = eco.createLegalEntity({
    legalName: '工廠打卡系統',
    didWeb: 'did:web:factory.example',
    leiTag: 'FACTORYEXAMPLE',
    signingJwk: base.publicKey as unknown as Record<string, unknown>,
    issuerTier: granted,
  });

  return bundle(base, requireIssuerSigningKey(entity.presentation(), eco.trust));
}

async function bundle(issuer: Issuer, issuerKey: ReturnType<typeof requireIssuerSigningKey>) {
  const worker = await generateKeyPair();
  const credential = await issuer.issue('WorkingHoursCredential', CLAIMS);
  const attestation = await createWorkerAttestation(worker.privateKey, {
    workerDID: WORKER_DID,
    credential,
    deviceFingerprint: 'sha256:synthetic-device-001',
  });

  return {
    issuerKey,
    worker,
    attestation,
    presentation: await presentCredential(credential, ['withinRBALimit', 'periodStart']),
  };
}

const gate = (p: Awaited<ReturnType<typeof honest>>, extra: Record<string, unknown> = {}) =>
  checkCredentialLayer({
    presentation: p.presentation,
    attestation: p.attestation,
    issuerPublicKey: p.issuerKey,
    workerPublicKey: p.worker.publicKey,
    requiredClaims: ['withinRBALimit'],
    ...extra,
  });

describe('the tier comes from the chain, not from the issuer (題06 Q1)', () => {
  test('the QVI writes the tier into the Legal Entity credential', async () => {
    const eco = bootstrapEcosystem();
    const audited = await createVleiIssuer({
      didWeb: 'did:web:factory.example',
      legalName: '工廠打卡系統',
      leiTag: 'FACTORYEXAMPLE',
      ecosystem: eco,
      options: { tier: 'THIRD_PARTY_VERIFIED' },
    });

    const key = requireIssuerSigningKey(audited.legalEntityPresentation(), eco.trust);

    expect(chainTierOf(key)).toBe('THIRD_PARTY_VERIFIED');
  });

  test('a Legal Entity credential with no tier grants nothing, which reads as the weakest', async () => {
    const eco = bootstrapEcosystem();
    const unvetted = await createVleiIssuer({
      didWeb: 'did:web:factory.example',
      legalName: '工廠打卡系統',
      leiTag: 'FACTORYEXAMPLE',
      ecosystem: eco,
    });

    const key = requireIssuerSigningKey(unvetted.legalEntityPresentation(), eco.trust);

    expect(chainTierOf(key)).toBeUndefined();
  });

  test('an issuer whose chain grants authority tier is admitted at that tier', async () => {
    const p = await honest('AUTHORITY_CERTIFIED');

    const decision = await gate(p, { minimumIssuerTier: 'AUTHORITY_CERTIFIED' });

    expect(decision.ok).toBe(true);
  });

  test('a self-declared issuer is still refused where third-party backing is required', async () => {
    const p = await honest('SELF_DECLARED');

    const decision = await gate(p, { minimumIssuerTier: 'THIRD_PARTY_VERIFIED' });

    expect(decision.ok === false && decision.reason).toBe('ISSUER_TIER_BELOW_THRESHOLD');
  });

  test('a factory claiming to be a regulator is refused', async () => {
    // The attack this exists to stop. The credential verifies cryptographically
    // — it really was signed by that factory — and it says AUTHORITY_CERTIFIED
    // while the QVI only ever vetted it as self-declared.
    const p = await overclaiming('SELF_DECLARED', 'AUTHORITY_CERTIFIED');

    const decision = await gate(p);

    expect(decision.ok === false && decision.reason).toBe('ISSUER_TIER_MISMATCH');
  });

  test('over-claiming is refused even by one step', async () => {
    const p = await overclaiming('SELF_DECLARED', 'THIRD_PARTY_VERIFIED');

    const decision = await gate(p);

    expect(decision.ok === false && decision.reason).toBe('ISSUER_TIER_MISMATCH');
  });

  test('over-claiming is refused before the threshold check gets a chance to pass it', async () => {
    // Without the chain check this credential would sail through a
    // THIRD_PARTY_VERIFIED policy on the strength of its own say-so.
    const p = await overclaiming('SELF_DECLARED', 'THIRD_PARTY_VERIFIED');

    const decision = await gate(p, { minimumIssuerTier: 'THIRD_PARTY_VERIFIED' });

    expect(decision.ok === false && decision.reason).toBe('ISSUER_TIER_MISMATCH');
  });

  test('claiming less than the chain grants is allowed', async () => {
    // Modesty is not an attack. An issuer may consider a particular credential
    // weakly evidenced and say so.
    const p = await overclaiming('AUTHORITY_CERTIFIED', 'SELF_DECLARED');

    const decision = await gate(p);

    expect(decision.ok).toBe(true);
  });
});
