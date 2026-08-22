/**
 * The relying party's side of device presence — the check that was missing.
 *
 * `identity.ts` has always taken an `AssertionVerifier` and defaulted it to
 * one that refuses everything, which was honest but empty: the wallet produced
 * a real WebAuthn assertion and nothing on the verifier's side ever checked
 * its signature. Presence was a claim the browser made about itself.
 *
 * This is the other half. Given the credential's public key — the one handed
 * over at registration — it re-derives what the authenticator signed and
 * checks it:
 *
 *     signature over: authenticatorData || SHA-256(clientDataJSON)
 *
 * and then the things a signature alone does not settle:
 *
 *   - **`type` is `webauthn.get`.** A registration ceremony's client data is
 *     also signed by the same key. Without this, one can be replayed as the
 *     other.
 *   - **The challenge is the one this verifier issued.** A signature over
 *     someone else's challenge is a recording, not a presence.
 *   - **The origin is ours.** A valid assertion produced for another site is
 *     still valid — for that site.
 *   - **The RP ID hash matches.** The authenticator scopes its key to a domain
 *     and says which; a verifier that ignores it discards that scoping.
 *   - **The UV bit is set in `authenticatorData`,** not merely asserted in the
 *     surrounding JSON. Byte 32, bit 2. The self-reported `userVerified` field
 *     must agree with it, because a wallet that describes the authenticator
 *     differently from what the authenticator signed is the interesting case.
 *
 * Every failure returns false rather than throwing, and every unknown returns
 * false too. An assertion this code cannot understand has not established
 * presence — the same answer as no assertion at all.
 *
 * What it still does not prove: that the person verified by the authenticator
 * is the worker rather than someone whose finger also enrols on that phone,
 * and nothing about coercion. Those live in the enrolment registry and in the
 * boundary table respectively.
 */

import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import type { AssertionVerifier, DeviceAssertion } from './identity.js';
import type { PublicJwk } from './sdjwt.js';

/** Bit 2 of the flags byte: the authenticator verified its user. */
const FLAG_USER_VERIFIED = 0b0000_0100;
/** Bit 0: a user was at least present. UV without UP is a malformed assertion. */
const FLAG_USER_PRESENT = 0b0000_0001;
/** authenticatorData layout: 32-byte rpIdHash, 1 flags byte, 4-byte counter. */
const RP_ID_HASH_LENGTH = 32;
const MIN_AUTHENTICATOR_DATA_LENGTH = 37;

export interface RelyingPartyConfig {
  /**
   * The credential's public key as recorded at registration.
   *
   * The registry that stores it is the trust anchor here: this function checks
   * that the holder of *that* key signed, and cannot check that the key was
   * enrolled by the right person. See `createEnrollmentRegistry`.
   */
  readonly credentialPublicKey: PublicJwk;
  /** The RP ID the credential was scoped to, e.g. `wallet.example`. */
  readonly rpId: string;
  /** The exact origin, e.g. `https://wallet.example`. */
  readonly expectedOrigin: string;
  /**
   * The challenge this verifier issued, base64url.
   *
   * Required, and deliberately so: a verifier that accepts whatever challenge
   * arrives has replay protection in name only.
   */
  readonly expectedChallenge: string;
}

export function base64urlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Converts a WebAuthn ECDSA signature (ASN.1 DER) to the raw r||s WebCrypto wants.
 *
 * Authenticators emit DER; WebCrypto's `ECDSA` verify takes fixed-width raw.
 * Getting this wrong fails closed — a valid assertion would be rejected — but
 * it would be rejected for the wrong reason, so it is parsed rather than
 * guessed at.
 */
export function derToRawSignature(der: Uint8Array): Uint8Array | null {
  // SEQUENCE(0x30) len INTEGER(0x02) len r INTEGER(0x02) len s
  if (der.length < 8 || der[0] !== 0x30) return null;

  let offset = 2;
  // Long-form length byte for the sequence: skip the extra length octets.
  if ((der[1] ?? 0) > 0x80) offset += (der[1] ?? 0) - 0x80;

  const readInteger = (): Uint8Array | null => {
    if (der[offset] !== 0x02) return null;
    const length = der[offset + 1] ?? 0;
    const start = offset + 2;
    if (length === 0 || start + length > der.length) return null;
    offset = start + length;
    let value = der.subarray(start, start + length);
    // DER prepends 0x00 to keep the integer positive; strip it back off.
    while (value.length > 32 && value[0] === 0x00) value = value.subarray(1);
    if (value.length > 32) return null;
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };

  const r = readInteger();
  const s = readInteger();
  if (r === null || s === null) return null;

  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

function parseClientData(clientDataJSON: Uint8Array): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(clientDataJSON));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Builds the verifier that `verifyDevicePresence` has been asking for.
 *
 * Async because the signature check is: WebCrypto is the only ES256 verify
 * available in both a browser and Node without pulling in a server-only
 * dependency, and it is promise-based.
 */
export function createRelyingPartyVerifier(config: RelyingPartyConfig): AssertionVerifier {
  return async (assertion: DeviceAssertion): Promise<boolean> => {
    const { authenticatorData, clientDataJSON, signature } = assertion;

    // An assertion carrying no authenticator output is the pre-server shape:
    // a wallet's word for it. That was the gap; it does not pass here.
    if (authenticatorData === undefined || clientDataJSON === undefined) return false;

    const authData = base64urlToBytes(authenticatorData);
    const clientData = base64urlToBytes(clientDataJSON);
    const signatureBytes = base64urlToBytes(signature);
    if (authData === null || clientData === null || signatureBytes === null) return false;
    if (authData.length < MIN_AUTHENTICATOR_DATA_LENGTH) return false;

    const parsed = parseClientData(clientData);
    if (parsed === null) return false;
    if (parsed['type'] !== 'webauthn.get') return false;
    if (parsed['origin'] !== config.expectedOrigin) return false;
    if (typeof parsed['challenge'] !== 'string') return false;
    if (parsed['challenge'] !== config.expectedChallenge) return false;
    // The wallet also names the challenge outside the signed data. Where the
    // two disagree, the signed one is the fact and this one is a claim — so
    // the disagreement itself is the finding.
    if (assertion.challenge !== config.expectedChallenge) return false;

    if (!equalBytes(authData.subarray(0, RP_ID_HASH_LENGTH), sha256(utf8ToBytes(config.rpId)))) {
      return false;
    }

    const flags = authData[RP_ID_HASH_LENGTH] ?? 0;
    if ((flags & FLAG_USER_PRESENT) === 0) return false;
    if ((flags & FLAG_USER_VERIFIED) === 0) return false;
    // The gate reads `userVerified`; if it and the signed flags could differ,
    // the gate would be reading the wallet's summary rather than the device's.
    if (assertion.userVerified !== true) return false;

    const raw =
      signatureBytes.length === 64 ? signatureBytes : derToRawSignature(signatureBytes);
    if (raw === null) return false;

    const signedData = new Uint8Array(authData.length + 32);
    signedData.set(authData, 0);
    signedData.set(sha256(clientData), authData.length);

    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        config.credentialPublicKey as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );

      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        raw as unknown as BufferSource,
        signedData as unknown as BufferSource,
      );
    } catch {
      return false;
    }
  };
}
