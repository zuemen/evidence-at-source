import { describe, expect, test } from 'vitest';
import { generateKeyPair, type PublicJwk } from '@eas/shared';
import { bootstrapEcosystem } from '@eas/vlei';
import { CREDENTIAL_LIFETIME_SECONDS, createVleiIssuer } from '@eas/issuer';
import {
  AUDIT_GENESIS,
  createAuditTrail,
  requireIssuerSigningKey,
  verifyAuditTrail,
} from '@eas/agents';

/**
 * An institution whose sealing key is the one its Legal Entity credential
 * publishes. A challenger checking these seals is checking a key that came off
 * the chain rather than one handed over by the party being audited.
 */
async function sealingInstitution() {
  const eco = bootstrapEcosystem();
  const keyPair = await generateKeyPair();
  const bank = await createVleiIssuer({
    didWeb: 'did:web:bank.example',
    legalName: '國泰世華銀行',
    leiTag: 'BANKEXAMPLE',
    ecosystem: eco,
    options: { keyPair },
  });

  return {
    privateKey: keyPair.privateKey,
    chainKey: requireIssuerSigningKey(bank.legalEntityPresentation(), eco.trust) as PublicJwk,
  };
}

const DECISION = {
  agentRole: 'bank',
  layer: 'L1',
  action: 'assess-account-opening',
  decision: 'ALLOW',
  reason: null,
  basis: { delegationHash: 'sha256:synthetic-delegation', ecrSaid: 'ESyntheticEcrSaid' },
} as const;

const DENIAL = {
  ...DECISION,
  decision: 'DENY',
  reason: 'CREDENTIAL_REVOKED',
} as const;

describe('the audit trail is evidence, not a list its holder can edit (題05 Q4／題06 Q4)', () => {
  test('the first entry commits to genesis and each later one to its predecessor', () => {
    const trail = createAuditTrail();

    const first = trail.record(DECISION);
    const second = trail.record(DENIAL);

    expect(first.prev).toBe(AUDIT_GENESIS);
    expect(second.prev).not.toBe(AUDIT_GENESIS);
    expect(second.seq).toBe(2);
  });

  test('an untouched exported trail verifies', async () => {
    const trail = createAuditTrail();
    trail.record(DECISION);
    trail.record(DENIAL);

    const verdict = await verifyAuditTrail(await trail.export());

    expect(verdict).toEqual({ ok: true, verifiedEntries: 2, sealed: false });
  });

  test('editing a past decision breaks the chain at that entry', async () => {
    // The scenario the whole mechanism exists for: a brand quietly turning a
    // DENY into an ALLOW after an NGO starts asking questions.
    const trail = createAuditTrail();
    trail.record(DECISION);
    trail.record(DENIAL);
    trail.record(DECISION);
    const exported = [...(await trail.export())];
    const tampered = exported[1];
    if (tampered === undefined) throw new Error('expected three entries');

    exported[1] = { ...tampered, entry: { ...tampered.entry, decision: 'ALLOW', reason: null } };
    const verdict = await verifyAuditTrail(exported);

    expect(verdict).toEqual({ ok: false, reason: 'CHAIN_BROKEN', atSeq: 3 });
  });

  test('deleting an inconvenient entry from the middle is caught', async () => {
    const trail = createAuditTrail();
    trail.record(DECISION);
    trail.record(DENIAL);
    trail.record(DECISION);
    const exported = await trail.export();

    const verdict = await verifyAuditTrail([exported[0]!, exported[2]!]);

    expect(verdict).toEqual({ ok: false, reason: 'SEQUENCE_BROKEN', atSeq: 3 });
  });

  test('a sealed trail verifies against the key the chain publishes', async () => {
    const institution = await sealingInstitution();
    const trail = createAuditTrail({
      signingKey: institution.privateKey,
      verifierDid: 'did:web:bank.example',
    });
    trail.record(DECISION);
    trail.record(DENIAL);

    const verdict = await verifyAuditTrail(await trail.export(), institution.chainKey);

    expect(verdict).toEqual({ ok: true, verifiedEntries: 2, sealed: true });
  });

  test('a key that did not come off the chain is refused before anything is read', async () => {
    // The exception this closes: everywhere else a signing key must arrive
    // through a verified Legal Entity chain, and an audit trail was the one
    // place a bare key handed over by the audited party would do.
    const bare = await generateKeyPair();
    const trail = createAuditTrail({ signingKey: bare.privateKey });
    trail.record(DECISION);

    const verdict = await verifyAuditTrail(await trail.export(), bare.publicKey);

    expect(verdict).toEqual({ ok: false, reason: 'KEY_NOT_CHAIN_VERIFIED', atSeq: 0 });
  });

  test('a seal from the wrong key is refused', async () => {
    const institution = await sealingInstitution();
    const impostor = await generateKeyPair();
    const trail = createAuditTrail({ signingKey: impostor.privateKey });
    trail.record(DECISION);

    const verdict = await verifyAuditTrail(await trail.export(), institution.chainKey);

    expect(verdict).toEqual({ ok: false, reason: 'SEAL_INVALID', atSeq: 1 });
  });

  test('editing a sealed entry is caught even when the chain is rebuilt around it', async () => {
    // A determined holder can recompute the chain. They cannot re-sign it.
    const institution = await sealingInstitution();
    const trail = createAuditTrail({ signingKey: institution.privateKey });
    trail.record(DENIAL);
    const exported = [...(await trail.export())];
    const only = exported[0];
    if (only === undefined) throw new Error('expected one entry');

    exported[0] = { ...only, entry: { ...only.entry, decision: 'ALLOW' } };
    const verdict = await verifyAuditTrail(exported, institution.chainKey);

    expect(verdict).toEqual({ ok: false, reason: 'SEAL_INVALID', atSeq: 1 });
  });

  test('an unsealed trail reports itself as unsealed rather than passing quietly', async () => {
    const institution = await sealingInstitution();
    const trail = createAuditTrail();
    trail.record(DECISION);

    const verdict = await verifyAuditTrail(await trail.export(), institution.chainKey);

    expect(verdict).toEqual({ ok: true, verifiedEntries: 1, sealed: false });
  });

  test('an audit entry never carries a worker field value', async () => {
    const trail = createAuditTrail();
    trail.record(DENIAL);

    const [first] = trail.entries();

    expect(Object.keys(first ?? {})).toEqual([
      'agentRole',
      'layer',
      'action',
      'decision',
      'reason',
      'basis',
      'seq',
      'at',
      'prev',
    ]);
  });
});

describe('credential lifetimes follow the half-life of the fact (題06 Q5)', () => {
  test('a pay period expires long before a contract does', () => {
    expect(CREDENTIAL_LIFETIME_SECONDS.WorkingHoursCredential).toBeLessThan(
      CREDENTIAL_LIFETIME_SECONDS.ContractConsentCredential,
    );
  });

  test('hours and deposits share a window, because they are reconciled against each other', () => {
    expect(CREDENTIAL_LIFETIME_SECONDS.WorkingHoursCredential).toBe(
      CREDENTIAL_LIFETIME_SECONDS.SalaryDepositCredential,
    );
  });

  test('custody sits between the two: it changes, but not every pay period', () => {
    expect(CREDENTIAL_LIFETIME_SECONDS.DocumentCustodyCredential).toBeGreaterThan(
      CREDENTIAL_LIFETIME_SECONDS.WorkingHoursCredential,
    );
    expect(CREDENTIAL_LIFETIME_SECONDS.DocumentCustodyCredential).toBeLessThan(
      CREDENTIAL_LIFETIME_SECONDS.RecruitmentFeeCredential,
    );
  });
});
