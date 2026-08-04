import { describe, expect, test } from 'vitest';
import { MATTER_CODES, decodeMatter, encodeMatter } from '@eas/vlei';

function filled(length: number, seed: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 7 + seed) % 256);
}

describe('CESR matter encoding', () => {
  test('a 32-byte digest round-trips through code E with length 44', () => {
    const raw = filled(32, 3);
    const qb64 = encodeMatter(MATTER_CODES.Blake3_256, raw);

    expect(qb64).toHaveLength(44);
    expect(qb64.startsWith('E')).toBe(true);
    expect(decodeMatter(qb64)).toEqual({ code: 'E', raw });
  });

  test('a 32-byte Ed25519 verfer round-trips through code D', () => {
    const raw = filled(32, 11);
    const qb64 = encodeMatter(MATTER_CODES.Ed25519, raw);

    expect(qb64).toHaveLength(44);
    expect(qb64.startsWith('D')).toBe(true);
    expect(decodeMatter(qb64).raw).toEqual(raw);
  });

  test('a 64-byte signature round-trips through code 0B with length 88', () => {
    const raw = filled(64, 5);
    const qb64 = encodeMatter(MATTER_CODES.Ed25519_Sig, raw);

    expect(qb64).toHaveLength(88);
    expect(qb64.startsWith('0B')).toBe(true);
    expect(decodeMatter(qb64)).toEqual({ code: '0B', raw });
  });

  test('encoding rejects a raw size that does not match the code', () => {
    expect(() => encodeMatter('E', filled(31, 0))).toThrow();
    expect(() => encodeMatter('0B', filled(32, 0))).toThrow();
  });

  test('decoding rejects an unknown code', () => {
    expect(() => decodeMatter('Z'.repeat(44))).toThrow();
  });
});
