/**
 * 配對必須把反簽綁到憑證的當事人身上。
 *
 * 這個檔案來自把實作寫成規格的過程。要寫下「驗證方必須依序做哪些檢查」時，才發現
 * `verifyPairing` 只確認了兩件事：反簽的簽章有效，且它指向這張憑證的雜湊。
 *
 * **它從來沒有檢查反簽的人就是憑證上的那個人。**
 *
 * 現行 demo 沒有出事，是因為呼叫端自己挑對了公鑰。但一個照著規格實作的人，很自然會從
 * 反簽的 `iss` 去解出公鑰——那樣的話，勞工 A 可以替勞工 B 的憑證反簽，而配對會成立。
 * 一個「靠呼叫端記得做對」的保證不是保證，這正是這個 repo 上一輪剛修完的那類洞。
 */
import { describe, expect, test } from 'vitest';
import { createWorkerAttestation, generateKeyPair, presentCredential } from '@eas/shared';
import { checkCredentialLayer } from '@eas/agents';
import { setupIssuerWorld } from './helpers/vleiWorld.js';

const SUBJECT = 'did:key:zWorker001';
const OTHER = 'did:key:zWorker002';

describe('反簽的當事人必須就是憑證的當事人', () => {
  test('a credential counter-signed by someone else is refused', async () => {
    const world = await setupIssuerWorld();
    const impostor = await generateKeyPair();

    // A credential about worker 001, counter-signed by worker 002 with their
    // own valid key, naming themselves as the subject of the attestation.
    const credential = await world.issuer.issue('WorkingHoursCredential', {
      workerDID: SUBJECT,
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
    });
    const attestation = await createWorkerAttestation(impostor.privateKey, {
      workerDID: OTHER,
      credential,
      deviceFingerprint: 'sha256:synthetic-device-002',
    });

    const decision = await checkCredentialLayer({
      presentation: await presentCredential(credential, ['withinRBALimit']),
      attestation,
      issuerPublicKey: world.issuerKey,
      // The impostor's key really does verify their signature. That is the
      // point: every signature here is genuine, and the pair is still wrong.
      workerPublicKey: impostor.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.reason).toBe('ATTESTATION_SUBJECT_MISMATCH');
  });

  test('the subject’s own counter-signature still pairs', async () => {
    // Proves the refusal above is about the subject and not a broken fixture.
    const world = await setupIssuerWorld();
    const worker = await generateKeyPair();

    const credential = await world.issuer.issue('WorkingHoursCredential', {
      workerDID: SUBJECT,
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
    });

    const decision = await checkCredentialLayer({
      presentation: await presentCredential(credential, ['withinRBALimit']),
      attestation: await createWorkerAttestation(worker.privateKey, {
        workerDID: SUBJECT,
        credential,
        deviceFingerprint: 'sha256:synthetic-device-001',
      }),
      issuerPublicKey: world.issuerKey,
      workerPublicKey: worker.publicKey,
      requiredClaims: ['withinRBALimit'],
    });

    expect(decision.ok).toBe(true);
  });
});
