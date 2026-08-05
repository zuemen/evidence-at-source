import { describe, expect, test } from 'vitest';
import { generateKeyPair } from '@eas/shared';
import {
  createVerificationLog,
  issueVerificationReceipt,
  verifyReceipt,
  type VerificationReceipt,
} from '@eas/agents';

const base: VerificationReceipt = {
  verifierDid: 'did:web:brand.example',
  subjectCredentialHash: 'abc123',
  verifiedItems: ['withinRBALimit'],
  result: 'PASS',
  verifiedAt: '2026-08-04T10:00:00Z',
};

describe('verification receipt (題06 Q4 — presentable due-diligence proof)', () => {
  test('a receipt round-trips and verifies under the verifier key', async () => {
    const verifier = await generateKeyPair();

    const receipt = await issueVerificationReceipt(verifier.privateKey, base);
    const read = await verifyReceipt(receipt, verifier.publicKey);

    expect(read?.verifierDid).toBe('did:web:brand.example');
    expect(read?.verifiedItems).toEqual(['withinRBALimit']);
    expect(read?.result).toBe('PASS');
  });

  test('a receipt does not verify under a different key', async () => {
    const verifier = await generateKeyPair();
    const impostor = await generateKeyPair();

    const receipt = await issueVerificationReceipt(verifier.privateKey, base);

    expect(await verifyReceipt(receipt, impostor.publicKey)).toBeNull();
  });

  test('a tampered receipt does not verify', async () => {
    const verifier = await generateKeyPair();
    const receipt = await issueVerificationReceipt(verifier.privateKey, base);

    const [header, , signature] = receipt.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...base, result: 'PASS', iss: base.verifierDid }),
      'utf8',
    ).toString('base64url');

    expect(await verifyReceipt(`${header}.${forgedPayload}.${signature}`, verifier.publicKey)).toBeNull();
  });

  test('the receipt records item names, never raw values', async () => {
    const verifier = await generateKeyPair();

    const receipt = await issueVerificationReceipt(verifier.privateKey, base);

    expect(receipt).not.toContain('186');
    expect(receipt).not.toContain('totalHours');
  });
});

describe('verification log and revocation notification (題06 Q5)', () => {
  const receipt = (verifierDid: string, hash: string): VerificationReceipt => ({
    ...base,
    verifierDid,
    subjectCredentialHash: hash,
  });

  test('records who verified which credential, de-duplicated', () => {
    const log = createVerificationLog();
    log.record(receipt('did:web:brand-a.example', 'hash-1'));
    log.record(receipt('did:web:brand-b.example', 'hash-1'));
    log.record(receipt('did:web:brand-a.example', 'hash-1'));

    expect([...log.verifiersOf('hash-1')].sort()).toEqual([
      'did:web:brand-a.example',
      'did:web:brand-b.example',
    ]);
  });

  test('revocation produces one notice per prior verifier of that credential', () => {
    const log = createVerificationLog();
    log.record(receipt('did:web:brand-a.example', 'hash-1'));
    log.record(receipt('did:web:brand-b.example', 'hash-1'));
    log.record(receipt('did:web:brand-c.example', 'hash-2'));

    const notices = log.notifyRevocation('hash-1');

    expect(notices.map((n) => n.verifierDid).sort()).toEqual([
      'did:web:brand-a.example',
      'did:web:brand-b.example',
    ]);
    expect(notices.every((n) => n.subjectCredentialHash === 'hash-1')).toBe(true);
  });

  test('a credential nobody verified produces no notices', () => {
    const log = createVerificationLog();

    expect(log.notifyRevocation('never-seen')).toEqual([]);
  });

  test('a notice carries no worker identifier', () => {
    const log = createVerificationLog();
    log.record(receipt('did:web:brand-a.example', 'hash-1'));

    expect(JSON.stringify(log.notifyRevocation('hash-1'))).not.toContain('zWorker');
  });
});
