import { describe, expect, test } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import { createRelyingPartyVerifier } from '../src/relyingParty.js';
import { verifyDevicePresence } from '../src/identity.js';
import { bytesToBase64url } from '../src/hash.js';
import { createWorkerAttestation } from '../src/attestation.js';
import type { DeviceAssertion } from '../src/identity.js';
import type { PrivateJwk, PublicJwk } from '../src/sdjwt.js';
import { generateKeyPair, exportJWK } from 'jose';

/**
 * A synthetic authenticator.
 *
 * It does what a real one does and nothing more: build authenticatorData,
 * hash the client data, sign the concatenation with the credential key. If
 * this test passed against something the verifier itself constructed it would
 * be checking its own arithmetic, so every field here is assembled the way the
 * WebAuthn spec lays it out and the verifier never sees the pieces.
 */
const RP_ID = 'wallet.example';
const ORIGIN = 'https://wallet.example';
const CHALLENGE = bytesToBase64url(new Uint8Array(32).fill(7));

interface Authenticator {
  readonly publicKey: PublicJwk;
  sign(options?: {
    readonly userVerified?: boolean;
    readonly userPresent?: boolean;
    readonly rpId?: string;
    readonly origin?: string;
    readonly challenge?: string;
    readonly type?: string;
  }): Promise<DeviceAssertion>;
}

async function createAuthenticator(): Promise<Authenticator> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const publicKey = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as PublicJwk;

  return {
    publicKey,
    async sign(options = {}) {
      const {
        userVerified = true,
        userPresent = true,
        rpId = RP_ID,
        origin = ORIGIN,
        challenge = CHALLENGE,
        type = 'webauthn.get',
      } = options;

      const clientData = utf8ToBytes(JSON.stringify({ type, challenge, origin }));

      const authenticatorData = new Uint8Array(37);
      authenticatorData.set(sha256(utf8ToBytes(rpId)), 0);
      authenticatorData[32] = (userPresent ? 0b0000_0001 : 0) | (userVerified ? 0b0000_0100 : 0);
      authenticatorData[36] = 1; // signature counter

      const signed = new Uint8Array(authenticatorData.length + 32);
      signed.set(authenticatorData, 0);
      signed.set(sha256(clientData), authenticatorData.length);

      const signature = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          pair.privateKey,
          signed as unknown as BufferSource,
        ),
      );

      return {
        credentialId: 'cred-001',
        challenge,
        userVerified,
        signature: bytesToBase64url(signature),
        authenticatorData: bytesToBase64url(authenticatorData),
        clientDataJSON: bytesToBase64url(clientData),
      };
    },
  };
}

function verifierFor(publicKey: PublicJwk) {
  return createRelyingPartyVerifier({
    credentialPublicKey: publicKey,
    rpId: RP_ID,
    expectedOrigin: ORIGIN,
    expectedChallenge: CHALLENGE,
  });
}

describe('a relying party checks the assertion instead of believing the wallet', () => {
  test('a genuine assertion from the enrolled credential verifies', async () => {
    const authenticator = await createAuthenticator();

    expect(await verifierFor(authenticator.publicKey)(await authenticator.sign())).toBe(true);
  });

  test('an assertion carrying no authenticator output is refused', async () => {
    // The shape the wallet produced before there was a server to check it:
    // userVerified is asserted, nothing is signed over.
    const authenticator = await createAuthenticator();
    const full = await authenticator.sign();
    const claimOnly: DeviceAssertion = {
      credentialId: full.credentialId,
      challenge: full.challenge,
      userVerified: true,
      signature: full.signature,
    };

    expect(await verifierFor(authenticator.publicKey)(claimOnly)).toBe(false);
  });

  test('a signature from a different credential is refused', async () => {
    const enrolled = await createAuthenticator();
    const other = await createAuthenticator();

    expect(await verifierFor(enrolled.publicKey)(await other.sign())).toBe(false);
  });

  test('a registration ceremony cannot be replayed as an assertion', async () => {
    const authenticator = await createAuthenticator();
    const created = await authenticator.sign({ type: 'webauthn.create' });

    expect(await verifierFor(authenticator.publicKey)(created)).toBe(false);
  });

  test('an assertion over another challenge is a recording, not a presence', async () => {
    const authenticator = await createAuthenticator();
    const replayed = await authenticator.sign({
      challenge: bytesToBase64url(new Uint8Array(32).fill(9)),
    });

    expect(await verifierFor(authenticator.publicKey)(replayed)).toBe(false);
  });

  test('an assertion produced for another site stays valid only for that site', async () => {
    const authenticator = await createAuthenticator();
    const elsewhere = await authenticator.sign({
      rpId: 'phish.example',
      origin: 'https://phish.example',
    });

    expect(await verifierFor(authenticator.publicKey)(elsewhere)).toBe(false);
  });

  test('the RP ID hash is checked even when the origin string is ours', async () => {
    // A relying party that reads only clientDataJSON discards the scoping the
    // authenticator itself applied.
    const authenticator = await createAuthenticator();
    const mismatched = await authenticator.sign({ rpId: 'other.example' });

    expect(await verifierFor(authenticator.publicKey)(mismatched)).toBe(false);
  });

  test('an authenticator that did not verify its user is refused', async () => {
    const authenticator = await createAuthenticator();
    const noUv = await authenticator.sign({ userVerified: false });

    expect(await verifierFor(authenticator.publicKey)(noUv)).toBe(false);
  });

  test('a wallet claiming UV that the signed flags do not carry is refused', async () => {
    // The interesting forgery: the authenticator is honest, the wallet is not.
    const authenticator = await createAuthenticator();
    const signed = await authenticator.sign({ userVerified: false });
    const overclaimed: DeviceAssertion = { ...signed, userVerified: true };

    expect(await verifierFor(authenticator.publicKey)(overclaimed)).toBe(false);
  });

  test('tampered authenticator data breaks the signature', async () => {
    const authenticator = await createAuthenticator();
    const genuine = await authenticator.sign();
    const bytes = new Uint8Array(32).fill(0);
    const forged: DeviceAssertion = {
      ...genuine,
      authenticatorData: bytesToBase64url(new Uint8Array([...bytes, 0b0000_0101, 0, 0, 0, 2])),
    };

    expect(await verifierFor(authenticator.publicKey)(forged)).toBe(false);
  });

  test('malformed base64url is refused rather than thrown', async () => {
    const authenticator = await createAuthenticator();
    const genuine = await authenticator.sign();

    expect(
      await verifierFor(authenticator.publicKey)({ ...genuine, signature: '!!!not-base64!!!' }),
    ).toBe(false);
  });
});

describe('the gate reaches the same verdict through the presence check', () => {
  async function workerKeys(): Promise<{ privateKey: PrivateJwk; publicKey: PublicJwk }> {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    return {
      privateKey: (await exportJWK(privateKey)) as PrivateJwk,
      publicKey: (await exportJWK(publicKey)) as PublicJwk,
    };
  }

  test('presence holds when a real assertion travels inside the attestation', async () => {
    const authenticator = await createAuthenticator();
    const worker = await workerKeys();
    const attestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: 'did:key:zWorker001',
      credential: 'eyJhbGciOiJFUzI1NiJ9.e30.sig',
      deviceFingerprint: 'device-001',
      deviceAssertion: await authenticator.sign(),
    });

    const result = await verifyDevicePresence(
      attestation,
      worker.publicKey,
      'cred-001',
      verifierFor(authenticator.publicKey),
    );

    expect(result).toEqual({ ok: true });
  });

  test('a forged assertion fails the gate with USER_PRESENCE_NOT_VERIFIED', async () => {
    const enrolled = await createAuthenticator();
    const attacker = await createAuthenticator();
    const worker = await workerKeys();
    const attestation = await createWorkerAttestation(worker.privateKey, {
      workerDID: 'did:key:zWorker001',
      credential: 'eyJhbGciOiJFUzI1NiJ9.e30.sig',
      deviceFingerprint: 'device-001',
      deviceAssertion: await attacker.sign(),
    });

    const result = await verifyDevicePresence(
      attestation,
      worker.publicKey,
      'cred-001',
      verifierFor(enrolled.publicKey),
    );

    expect(result).toEqual({ ok: false, reason: 'USER_PRESENCE_NOT_VERIFIED' });
  });
});
