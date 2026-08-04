/**
 * Isomorphic hashing and base64url — the same code runs in Node and the browser.
 *
 * We deliberately avoid `node:crypto` and `Buffer` so the whole system (keygen,
 * signing, hashing) can run on the worker's device with no server. SHA-256 comes
 * from @noble/hashes (synchronous, audited, isomorphic); base64url uses the
 * global btoa/atob available in Node 16+ and every browser.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils';

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToUtf8(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** SHA-256 of a UTF-8 string, base64url-encoded. */
export function sha256Base64url(input: string): string {
  return bytesToBase64url(sha256(utf8ToBytes(input)));
}

/** SHA-256 of the concatenation of byte parts, hex-encoded. */
export function sha256Hex(...parts: Uint8Array[]): string {
  return bytesToHex(sha256(concatBytes(...parts)));
}

export { hexToBytes, utf8ToBytes };
