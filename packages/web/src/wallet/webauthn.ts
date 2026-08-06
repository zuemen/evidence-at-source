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

/**
 * Registers this device as the worker's authenticator.
 *
 * `residentKey` and `userVerification: 'required'` together are what make the
 * result mean "this person", rather than "someone holding this phone".
 */
export async function registerDevice(workerDid: string): Promise<string | null> {
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

    return credential === null ? null : bytesToBase64url(new Uint8Array(credential.rawId));
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
    };
  } catch {
    return null;
  }
}
