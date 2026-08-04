import { describe, expect, test } from 'vitest';
import { utf8ToBytes } from '@eas/shared';
import {
  KelStore,
  createAid,
  createKeyMaterial,
  verifyKel,
  verifyThreshold,
  type SignedKelEvent,
} from '@eas/vlei';

describe('AID inception and rotation (threshold multisig)', () => {
  test('a default single-sig AID incepts and verifies', () => {
    const controller = createAid();

    expect(controller.aid).toBe(controller.kel[0]?.event.d);
    expect(controller.currentKeyState().threshold).toBe(1);
    expect(verifyKel(controller.kel)).toBe(true);
  });

  test('a 2-of-3 AID incepts, signs and verifies at threshold', () => {
    const controller = createAid({ keyCount: 3, threshold: 2 });
    const data = utf8ToBytes('payload');
    const { sigs, sigSeq } = controller.sign(data);

    expect(sigSeq).toBe(0);
    expect(sigs).toHaveLength(3);
    expect(verifyThreshold(controller.currentKeyState(), sigs, data)).toBe(true);
  });

  test('below-threshold signatures are refused', () => {
    const controller = createAid({ keyCount: 3, threshold: 2 });
    const data = utf8ToBytes('payload');
    const { sigs } = controller.sign(data);
    const stranger = createAid({ keyCount: 3, threshold: 2 });
    const foreign = stranger.sign(data).sigs;

    // Two of three signatures replaced by another controller's: only one valid.
    const crippled = [sigs[0]!, foreign[1]!, foreign[2]!];

    expect(verifyThreshold(controller.currentKeyState(), crippled, data)).toBe(false);
  });

  test('rotation honours per-index pre-rotation commitments for all keys', () => {
    const controller = createAid({ keyCount: 3, threshold: 2 });
    controller.rotate();

    expect(controller.kel).toHaveLength(2);
    expect(verifyKel(controller.kel)).toBe(true);
    expect(controller.currentKeyState().keys).toHaveLength(3);
  });

  test('KelStore resolves the full key state per establishment seq', () => {
    const store = new KelStore();
    const controller = createAid({ keyCount: 2, threshold: 2 });
    store.register(controller.kel);

    const before = controller.currentKeyState().keys;
    controller.rotate();

    expect(store.keyStateAt(controller.aid, 0)?.keys).toEqual(before);
    expect(store.keyStateAt(controller.aid, 1)?.keys).toEqual(controller.currentKeyState().keys);
    expect(store.keyStateAt(controller.aid, 9)).toBeUndefined();
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
    expect(store.keyStateAt(controller.aid, 0)).toBeUndefined();
  });

  test('a rotation that breaks any pre-rotation commitment is rejected', () => {
    const controller = createAid({ keyCount: 2, threshold: 2 });
    controller.rotate();

    const kel = controller.kel as SignedKelEvent[];
    const rot = kel[1]!;
    const stranger = createKeyMaterial();
    const keys = [...(rot.event.k ?? [])];
    keys[1] = stranger.verfer;
    kel[1] = { ...rot, event: { ...rot.event, k: keys } };

    expect(verifyKel(kel)).toBe(false);
  });

  test('invalid threshold configurations are refused at creation', () => {
    expect(() => createAid({ keyCount: 2, threshold: 3 })).toThrow();
    expect(() => createAid({ keyCount: 0 })).toThrow();
    expect(() => createAid({ keyCount: 3, threshold: 0 })).toThrow();
  });
});

describe('interaction events and anchoring', () => {
  test('anchor() appends a verifiable ixn carrying the seal', () => {
    const store = new KelStore();
    const controller = createAid();
    store.register(controller.kel);
    const said = 'E' + 'S'.repeat(43);

    controller.anchor(said);

    expect(controller.kel).toHaveLength(2);
    expect(controller.kel[1]?.event.t).toBe('ixn');
    expect(verifyKel(controller.kel)).toBe(true);
    expect(store.isAnchored(controller.aid, said)).toBe(true);
    expect(store.isAnchored(controller.aid, 'E' + 'X'.repeat(43))).toBe(false);
  });

  test('rotation still verifies across interleaved ixn events', () => {
    const controller = createAid({ keyCount: 2, threshold: 2 });
    controller.anchor('E' + 'A'.repeat(43));
    controller.rotate();
    controller.anchor('E' + 'B'.repeat(43));

    expect(verifyKel(controller.kel)).toBe(true);
    const store = new KelStore();
    store.register(controller.kel);
    expect(store.keyStateAt(controller.aid, 2)?.keys).toEqual(controller.currentKeyState().keys);
  });

  test('a tampered seal breaks KEL verification', () => {
    const controller = createAid();
    controller.anchor('E' + 'A'.repeat(43));

    const kel = controller.kel as SignedKelEvent[];
    const ixn = kel[1]!;
    kel[1] = { ...ixn, event: { ...ixn.event, a: [{ d: 'E' + 'Z'.repeat(43) }] } };

    expect(verifyKel(kel)).toBe(false);
  });
});
