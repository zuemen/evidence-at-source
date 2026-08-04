/**
 * CESR "matter" primitives — the qualified base64url text domain of KERI.
 *
 * Only the three codes this project needs are implemented: Blake3-256 digests
 * ('E', which is also the SAID code), Ed25519 verifier keys ('D') and Ed25519
 * signatures ('0B'). Encoding follows the CESR pad rule: prepend as many zero
 * bytes as the code has characters, base64url-encode, then overwrite the pad
 * characters with the code.
 */

import { bytesToBase64url } from '@eas/shared';

export const MATTER_CODES = {
  Blake3_256: 'E',
  Ed25519: 'D',
  Ed25519_Sig: '0B',
} as const;

const CODE_RAW_SIZE: Readonly<Record<string, number>> = {
  E: 32,
  D: 32,
  '0B': 64,
};

function base64urlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeMatter(code: string, raw: Uint8Array): string {
  const expected = CODE_RAW_SIZE[code];
  if (expected === undefined) throw new Error(`unknown matter code: ${code}`);
  if (raw.length !== expected) {
    throw new Error(`matter code ${code} expects ${expected} raw bytes, got ${raw.length}`);
  }

  const padSize = (3 - (raw.length % 3)) % 3;
  if (padSize !== code.length) {
    throw new Error(`matter code ${code} is incompatible with a ${raw.length}-byte raw value`);
  }

  const padded = new Uint8Array(padSize + raw.length);
  padded.set(raw, padSize);

  return code + bytesToBase64url(padded).slice(code.length);
}

export function decodeMatter(qb64: string): { code: string; raw: Uint8Array } {
  const code = qb64.startsWith('0') ? qb64.slice(0, 2) : qb64.slice(0, 1);
  if (CODE_RAW_SIZE[code] === undefined) throw new Error(`unknown matter code: ${code}`);

  const padded = base64urlToBytes('A'.repeat(code.length) + qb64.slice(code.length));

  return { code, raw: padded.slice(code.length) };
}
