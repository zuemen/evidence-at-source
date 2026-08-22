/**
 * The producing side of device presence.
 *
 * The gate has always been able to check an assertion; what was missing was
 * anything that produced a real one. This is that — `navigator.credentials`,
 * a platform authenticator, and a key that lives in the device's secure
 * element and cannot be exported. That last property is the whole point: a
 * broker can copy a credential file, and cannot copy a finger.
 *
 * Everything here fails to `null` rather than throwing. A browser with no
 * authenticator, a user who cancels, an insecure origin — all of them mean the
 * same thing to a verifier, which is that presence was not established. The
 * gate then refuses, because `userVerified` never becomes true on its own.
 */

import type { DeviceAssertion } from '@eas/shared';

/** Synthetic and constant: this demo has no relying-party server to talk to. */
const RP_NAME = 'Evidence at Source (demo)';

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Annotated with its concrete buffer type: `Uint8Array` alone widens to
// ArrayBufferLike, which BufferSource does not accept.
function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof globalThis.PublicKeyCredential !== 'undefined' &&
    typeof globalThis.navigator?.credentials?.create === 'function'
  );
}

export interface RegisteredDevice {
  readonly credentialId: string;
  /**
   * The credential's public key, JWK — what a relying party needs to check any
   * later assertion.
   *
   * Null where the browser will not hand it over (`getPublicKey` is recent, and
   * an authenticator may use an algorithm outside the P-256 profile the
   * verifier implements). Null means the same thing everywhere in this file:
   * presence cannot later be established, so the gate will refuse.
   */
  readonly publicKeyJwk: JsonWebKey | null;
}

/**
 * Registers this device as the worker's authenticator.
 *
 * `residentKey` and `userVerification: 'required'` together are what make the
 * result mean "this person", rather than "someone holding this phone".
 *
 * The public key comes back with the credential id because presence is a claim
 * someone else has to check: the wallet cannot verify its own assertions, and a
 * relying party that never received a key can only take the browser's word.
 */
export async function registerDevice(workerDid: string): Promise<RegisteredDevice | null> {
  if (!isWebAuthnAvailable()) return null;

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: RP_NAME },
        user: {
          // Synthetic: a DID and a display label, never a real identifier.
          id: new TextEncoder().encode(workerDid),
          name: workerDid,
          displayName: '勞工錢包（合成資料）',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (credential === null) return null;

    return {
      credentialId: bytesToBase64url(new Uint8Array(credential.rawId)),
      publicKeyJwk: await extractPublicKey(credential),
    };
  } catch {
    return null;
  }
}

/**
 * Pulls the credential's public key out of the registration response as a JWK.
 *
 * SPKI rather than the COSE key that also travels in the attestation object:
 * `getPublicKey()` gives it in a form WebCrypto imports directly, which keeps a
 * CBOR decoder out of the wallet. An older browser returns null here, and the
 * caller treats that as "no verifiable presence" rather than falling back to
 * something weaker.
 */
async function extractPublicKey(credential: PublicKeyCredential): Promise<JsonWebKey | null> {
  const response = credential.response as AuthenticatorAttestationResponse;
  if (typeof response.getPublicKey !== 'function') return null;

  const spki = response.getPublicKey();
  if (spki === null) return null;

  try {
    const key = await crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );

    return await crypto.subtle.exportKey('jwk', key);
  } catch {
    return null;
  }
}

/**
 * Asks the authenticator to verify its user and sign a fresh challenge.
 *
 * The `userVerified` flag is read out of the authenticator data rather than
 * assumed — bit 2 of byte 32 is UV. Trusting the request's
 * `userVerification: 'required'` instead would be trusting the caller to
 * describe what the authenticator did.
 */
export async function assertPresence(
  credentialId: string,
  challenge: Uint8Array<ArrayBuffer> = randomChallenge(),
): Promise<DeviceAssertion | null> {
  if (!isWebAuthnAvailable()) return null;

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (assertion === null) return null;

    const response = assertion.response as AuthenticatorAssertionResponse;
    const authenticatorData = new Uint8Array(response.authenticatorData);
    const flags = authenticatorData[32] ?? 0;

    return {
      credentialId,
      challenge: bytesToBase64url(challenge),
      userVerified: (flags & 0b0000_0100) !== 0,
      signature: bytesToBase64url(new Uint8Array(response.signature)),
      // Carried through unchanged so the relying party checks what the device
      // signed rather than this function's reading of it. The `userVerified`
      // field above is a convenience for the UI; these two are the evidence.
      authenticatorData: bytesToBase64url(authenticatorData),
      clientDataJSON: bytesToBase64url(new Uint8Array(response.clientDataJSON)),
    };
  } catch {
    return null;
  }
}
