import { describe, expect, test } from 'vitest';
import {
  VLEI_RULES,
  VLEI_SCHEMAS,
  schemaBySaid,
  schemaSaid,
  validateAttributes,
  verifySaid,
} from '@eas/vlei';

describe('vLEI schema profiles', () => {
  test('all four schemas carry a verifiable $id SAID and distinct ids', () => {
    const names = ['qvi', 'legalEntity', 'oor', 'ecr'] as const;
    const saids = names.map((name) => schemaSaid(name));

    for (const name of names) {
      expect(verifySaid(VLEI_SCHEMAS[name] as unknown as Record<string, unknown>, ['$id'])).toBe(
        true,
      );
    }
    expect(new Set(saids).size).toBe(4);
  });

  test('schemaBySaid inverts schemaSaid', () => {
    expect(schemaBySaid(schemaSaid('ecr'))?.name).toBe('ecr');
    expect(schemaBySaid('E' + 'F'.repeat(43))).toBeUndefined();
  });

  test('official credentialType names are used', () => {
    expect(VLEI_SCHEMAS.qvi.credentialType).toBe('QualifiedvLEIIssuervLEICredential');
    expect(VLEI_SCHEMAS.legalEntity.credentialType).toBe('LegalEntityvLEICredential');
    expect(VLEI_SCHEMAS.ecr.credentialType).toBe(
      'LegalEntityEngagementContextRolevLEICredential',
    );
  });

  test('validateAttributes enforces required keys and value kinds', () => {
    expect(
      validateAttributes('ecr', {
        LEI: 'BANKEXAMPLEXXXXXXX00',
        agentDid: 'did:key:zBankAgent',
        engagementContextRole: 'ai-verification-agent',
      }),
    ).toBe(true);
    expect(validateAttributes('ecr', { LEI: 'X', agentDid: 'did:key:zBankAgent' })).toBe(false);
    expect(
      validateAttributes('legalEntity', {
        LEI: 'X',
        legalName: 'Bank',
        didWeb: 'did:web:bank.example',
        credentialSigningJwk: 'not-an-object',
      }),
    ).toBe(false);
  });

  test('the rules block is saidified and carries both official disclaimers', () => {
    expect(verifySaid(VLEI_RULES as unknown as Record<string, unknown>)).toBe(true);
    expect(VLEI_RULES.usageDisclaimer.l).toContain('does not assert');
    expect(VLEI_RULES.issuanceDisclaimer.l).toContain('accurate as of');
  });
});
