import { describe, expect, test } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@eas/shared';
import {
  KelStore,
  createAid,
  createKeyMaterial,
  decodeMatter,
  verifyKel,
  type SignedKelEvent,
} from '@eas/vlei';

describe('AID inception and rotation', () => {
  test('inception yields a self-addressing AID whose KEL verifies', () => {
    const controller = createAid();

    expect(controller.aid).toBe(controller.kel[0]?.event.d);
    expect(controller.aid.startsWith('E')).toBe(true);
    expect(verifyKel(controller.kel)).toBe(true);
  });

  test('sign() binds a signature to the current establishment seq', () => {
    const controller = createAid();
    const data = utf8ToBytes('payload');
    const { sig, sigSeq } = controller.sign(data);

    expect(sigSeq).toBe(0);
    const verfer = decodeMatter(controller.currentVerfer()).raw;
    expect(ed25519.verify(decodeMatter(sig).raw, data, verfer)).toBe(true);
  });

  test('rotation honours the pre-rotation commitment and the KEL still verifies', () => {
    const controller = createAid();
    const before = controller.currentVerfer();
    controller.rotate();

    expect(controller.currentVerfer()).not.toBe(before);
    expect(controller.kel).toHaveLength(2);
    expect(verifyKel(controller.kel)).toBe(true);
  });

  test('KelStore resolves keys per establishment seq, across rotations', () => {
    const store = new KelStore();
    const controller = createAid();
    store.register(controller.kel);

    const first = controller.currentVerfer();
    controller.rotate();

    expect(store.verferAt(controller.aid, 0)).toBe(first);
    expect(store.verferAt(controller.aid, 1)).toBe(controller.currentVerfer());
    expect(store.verferAt(controller.aid, 9)).toBeUndefined();
  });

  test('a tampered KEL fails verification and the store fails closed', () => {
    const store = new KelStore();
    const controller = createAid();
    store.register(controller.kel);

    const forged = createKeyMaterial();
    const kel = controller.kel as SignedKelEvent[];
    const icp = kel[0]!;
    kel[0] = { ...icp, event: { ...icp.event, k: [forged.verfer] } };

    expect(verifyKel(kel)).toBe(false);
    expect(store.verferAt(controller.aid, 0)).toBeUndefined();
  });

  test('a rotation that breaks the pre-rotation commitment is rejected', () => {
    const controller = createAid();
    controller.rotate();

    const kel = controller.kel as SignedKelEvent[];
    const rot = kel[1]!;
    const stranger = createKeyMaterial();
    kel[1] = { ...rot, event: { ...rot.event, k: [stranger.verfer] } };

    expect(verifyKel(kel)).toBe(false);
  });
});
