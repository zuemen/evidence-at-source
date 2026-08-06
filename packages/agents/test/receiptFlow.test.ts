import { describe, expect, test } from 'vitest';
import { generateKeyPair } from '@eas/shared';
import { createVerificationLog, issueVerificationReceipt, verifyReceipt } from '@eas/agents';

const BRAND_DID = 'did:web:brand.example';
const CREDENTIAL_HASH = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';

describe('a verification leaves a receipt that a challenger can check alone', () => {
  test('the receipt verifies under the verifier key and carries no raw values', async () => {
    const verifier = await generateKeyPair();
    const jwt = await issueVerificationReceipt(verifier.privateKey, {
      verifierDid: BRAND_DID,
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['workingHoursWithinLimit'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:00:00.000Z',
    });

    const checked = await verifyReceipt(jwt, verifier.publicKey);

    expect(checked?.verifierDid).toBe(BRAND_DID);
    expect(checked?.verifiedItems).toEqual(['workingHoursWithinLimit']);
    // The item name travels; the hours behind it never do.
    expect(jwt).not.toContain('186');
  });

  test('a receipt signed by someone else does not verify', async () => {
    const verifier = await generateKeyPair();
    const impostor = await generateKeyPair();
    const jwt = await issueVerificationReceipt(impostor.privateKey, {
      verifierDid: BRAND_DID,
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['workingHoursWithinLimit'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:00:00.000Z',
    });

    expect(await verifyReceipt(jwt, verifier.publicKey)).toBeNull();
  });

  test('revoking a credential names every verifier that ever checked it', () => {
    const log = createVerificationLog();
    log.record({
      verifierDid: BRAND_DID,
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['workingHoursWithinLimit'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:00:00.000Z',
    });
    log.record({
      verifierDid: 'did:web:bank.example',
      subjectCredentialHash: CREDENTIAL_HASH,
      verifiedItems: ['feeWithinLegalCap'],
      result: 'PASS',
      verifiedAt: '2026-08-06T00:01:00.000Z',
    });

    const notices = log.notifyRevocation(CREDENTIAL_HASH);

    expect(notices.map((n) => n.verifierDid).sort()).toEqual([
      'did:web:bank.example',
      BRAND_DID,
    ]);
    // The notice carries a hash, never a worker.
    expect(JSON.stringify(notices)).not.toContain('zWorker');
  });
});
