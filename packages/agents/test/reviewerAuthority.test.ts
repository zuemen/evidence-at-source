import { describe, expect, test } from 'vitest';
import { generateKeyPair, type PublicJwk } from '@eas/shared';
import { bootstrapEcosystem } from '@eas/vlei';
import { createVleiIssuer } from '@eas/issuer';
import {
  createAuditTrail,
  requireIssuerSigningKey,
  resolveReviewerAuthority,
  verifyAuditTrail,
} from '@eas/agents';

const OFFICER = 'did:key:zComplianceOfficer';
const ROLE = 'compliance-officer';

/** A bank, its Legal Entity chain, and a named officer holding an office in it. */
async function bankWithOfficer() {
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
    eco,
    bank,
    keyPair,
    chainKey: requireIssuerSigningKey(bank.legalEntityPresentation(), eco.trust) as PublicJwk,
    oor: bank.grantOfficialRole(OFFICER, '王小明（合成）', ROLE),
  };
}

describe('the person who approves has a chain too (題06 Q4)', () => {
  test('an officer in post resolves to their office', async () => {
    const w = await bankWithOfficer();

    const verdict = resolveReviewerAuthority(w.oor, w.eco.trust, ROLE);

    expect(verdict.ok).toBe(true);
    expect(verdict.ok === true && verdict.reviewer.personLegalName).toBe('王小明（合成）');
    expect(verdict.ok === true && verdict.reviewer.officialRole).toBe(ROLE);
  });

  test('an officer who has left cannot approve anything new', async () => {
    const w = await bankWithOfficer();
    expect(resolveReviewerAuthority(w.oor, w.eco.trust, ROLE).ok).toBe(true);

    w.bank.revokeOfficialRole(OFFICER);
    const after = resolveReviewerAuthority(w.oor, w.eco.trust, ROLE);

    expect(after.ok === false && after.reason).toBe('AGENT_VLEI_REVOKED');
  });

  test('an office is not a different office', async () => {
    // A compliance officer's credential does not make someone a branch manager.
    const w = await bankWithOfficer();

    const verdict = resolveReviewerAuthority(w.oor, w.eco.trust, 'branch-manager');

    expect(verdict.ok).toBe(false);
  });

  test('revoking the bank collapses its officers with it', async () => {
    const w = await bankWithOfficer();

    w.eco.revokeQviCredential();
    const verdict = resolveReviewerAuthority(w.oor, w.eco.trust, ROLE);

    expect(verdict.ok).toBe(false);
  });

  test('an approval records which office took it, and a gate decision records none', async () => {
    const w = await bankWithOfficer();
    const reviewer = resolveReviewerAuthority(w.oor, w.eco.trust, ROLE);
    if (!reviewer.ok) throw new Error('expected a resolvable officer');

    const trail = createAuditTrail({ signingKey: w.keyPair.privateKey });
    const gateDecision = trail.record({
      agentRole: 'bank',
      layer: 'L1',
      action: 'assess-account-opening',
      decision: 'ALLOW',
      reason: null,
      basis: { delegationHash: 'sha256:synthetic', ecrSaid: 'ESynthetic' },
    });
    const approval = trail.record({
      agentRole: 'bank',
      layer: 'L1',
      action: 'human-approval',
      decision: 'ALLOW',
      reason: null,
      basis: { delegationHash: 'sha256:synthetic', ecrSaid: 'ESynthetic' },
      reviewerOorSaid: reviewer.reviewer.oorSaid,
    });

    expect(gateDecision.reviewerOorSaid).toBeNull();
    expect(approval.reviewerOorSaid).toBe(reviewer.reviewer.oorSaid);
  });

  test('the reviewer field is inside the seal, so it cannot be added afterwards', async () => {
    // Backdating "a compliance officer approved this" onto an old decision is
    // exactly the edit an audit trail exists to prevent.
    const w = await bankWithOfficer();
    const trail = createAuditTrail({ signingKey: w.keyPair.privateKey });
    trail.record({
      agentRole: 'bank',
      layer: 'L1',
      action: 'assess-account-opening',
      decision: 'ALLOW',
      reason: null,
      basis: { delegationHash: 'sha256:synthetic', ecrSaid: 'ESynthetic' },
    });
    const exported = [...(await trail.export())];
    const only = exported[0];
    if (only === undefined) throw new Error('expected one entry');

    exported[0] = {
      ...only,
      entry: { ...only.entry, reviewerOorSaid: 'EFabricatedOfficeSaid' },
    };
    const verdict = await verifyAuditTrail(exported, w.chainKey);

    expect(verdict).toEqual({ ok: false, reason: 'SEAL_INVALID', atSeq: 1 });
  });
});
