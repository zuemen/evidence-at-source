import { describe, expect, test } from 'vitest';
import { presentCredential, verifyPresentation } from '@eas/shared';
import { createIssuer } from '@eas/issuer';

describe('issuer', () => {
  test('keeps schema-hidden fields out of the verified payload', async () => {
    const issuer = await createIssuer('did:web:factory.example');

    const credential = await issuer.issue('WorkingHoursCredential', {
      workerDID: 'did:key:zWorker001',
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
    });

    const presentation = await presentCredential(credential, ['withinRBALimit', 'periodStart']);
    const verified = await verifyPresentation(presentation, issuer.publicKey);

    expect('totalHours' in verified.payload).toBe(false);
    expect('overtimeHours' in verified.payload).toBe(false);
    expect(verified.payload['withinRBALimit']).toBe(true);
  });

  test('claims cannot overwrite the issuer identity or credential type', async () => {
    const issuer = await createIssuer('did:web:factory.example');

    const credential = await issuer.issue('WorkingHoursCredential', {
      workerDID: 'did:key:zWorker001',
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
      iss: 'did:web:attacker.example',
      vct: 'SomethingElseCredential',
    });

    const presentation = await presentCredential(credential, ['withinRBALimit', 'periodStart']);
    const verified = await verifyPresentation(presentation, issuer.publicKey);

    expect(verified.payload['iss']).toBe('did:web:factory.example');
    expect(verified.payload['vct']).toBe('WorkingHoursCredential');
  });
});
