/**
 * Threshold-multisig KERI key event logs with pre-rotation.
 *
 * An AID is the SAID of its inception event. Key state is a set of keys plus a
 * signing threshold (kt); every event carries one signature per current key and
 * verifies when at least `threshold` of them hold. Every rotation must present
 * keys whose digests were committed per-index in the previous establishment
 * event's `n` field. No witnesses, no delegation — documented simplifications.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { blake3 } from '@noble/hashes/blake3';
import { utf8ToBytes } from '@eas/shared';
import { MATTER_CODES, decodeMatter, encodeMatter } from './cesr.js';
import { saidify, verifySaid, versify, type Ked } from './said.js';

export interface KeyMaterial {
  readonly verfer: string;
  readonly secret: Uint8Array;
}

export function createKeyMaterial(): KeyMaterial {
  const secret = ed25519.utils.randomPrivateKey();
  return { secret, verfer: encodeMatter(MATTER_CODES.Ed25519, ed25519.getPublicKey(secret)) };
}

function digestOfQb64(qb64: string): string {
  return encodeMatter(MATTER_CODES.Blake3_256, blake3(utf8ToBytes(qb64), { dkLen: 32 }));
}

export interface KeyState {
  readonly keys: readonly string[];
  readonly threshold: number;
}

export interface KelEvent {
  readonly v: string;
  readonly t: 'icp' | 'rot';
  readonly d: string;
  readonly i: string;
  readonly s: string;
  readonly p?: string;
  readonly kt: string;
  readonly k: readonly string[];
  readonly nt: string;
  readonly n: readonly string[];
  readonly bt: string;
  readonly b?: readonly string[];
  readonly br?: readonly string[];
  readonly ba?: readonly string[];
  readonly c?: readonly string[];
  readonly a: readonly unknown[];
}

export interface SignedKelEvent {
  readonly event: KelEvent;
  readonly sigs: readonly string[];
}

export interface AidOptions {
  readonly keyCount?: number;
  readonly threshold?: number;
}

export interface AidController {
  readonly aid: string;
  readonly kel: readonly SignedKelEvent[];
  currentKeyState(): KeyState;
  sign(data: Uint8Array): { sigs: readonly string[]; sigSeq: number };
  rotate(): void;
}

function freshKeys(count: number): KeyMaterial[] {
  return Array.from({ length: count }, () => createKeyMaterial());
}

function signAll(event: Ked, materials: readonly KeyMaterial[]): string[] {
  const bytes = utf8ToBytes(JSON.stringify(event));
  return materials.map((material) =>
    encodeMatter(MATTER_CODES.Ed25519_Sig, ed25519.sign(bytes, material.secret)),
  );
}

/** Signatures are index-parallel to keys; at least `threshold` must verify. */
export function verifyThreshold(
  state: KeyState,
  sigs: readonly string[],
  data: Uint8Array,
): boolean {
  if (sigs.length !== state.keys.length) return false;

  let valid = 0;
  for (let at = 0; at < state.keys.length; at++) {
    const sig = sigs[at];
    const key = state.keys[at];
    if (sig === undefined || key === undefined) continue;
    try {
      if (ed25519.verify(decodeMatter(sig).raw, data, decodeMatter(key).raw)) valid++;
    } catch {
      // A malformed signature simply does not count toward the threshold.
    }
  }

  return valid >= state.threshold;
}

function eventKeyState(event: KelEvent): KeyState {
  return { keys: event.k, threshold: parseInt(event.kt, 16) };
}

export function createAid(options: AidOptions = {}): AidController {
  const keyCount = options.keyCount ?? 1;
  const threshold = options.threshold ?? keyCount;
  if (keyCount < 1 || threshold < 1 || threshold > keyCount) {
    throw new Error('threshold must satisfy 1 <= threshold <= keyCount');
  }

  let current = freshKeys(keyCount);
  let next = freshKeys(keyCount);
  let estSeq = 0;
  const kel: SignedKelEvent[] = [];

  const icp = saidify(
    {
      v: versify('KERI', 0),
      t: 'icp' as const,
      d: '',
      i: '',
      s: '0',
      kt: threshold.toString(16),
      k: current.map((m) => m.verfer),
      nt: threshold.toString(16),
      n: next.map((m) => digestOfQb64(m.verfer)),
      bt: '0',
      b: [],
      c: [],
      a: [],
    },
    ['d', 'i'],
  );
  kel.push({ event: icp as unknown as KelEvent, sigs: signAll(icp, current) });

  return {
    aid: icp.i,
    kel,

    currentKeyState: () => ({ keys: current.map((m) => m.verfer), threshold }),

    sign(data) {
      return {
        sigs: current.map((m) =>
          encodeMatter(MATTER_CODES.Ed25519_Sig, ed25519.sign(data, m.secret)),
        ),
        sigSeq: estSeq,
      };
    },

    rotate() {
      const upcoming = freshKeys(keyCount);
      const prior = kel[kel.length - 1]!.event;
      const seq = parseInt(prior.s, 16) + 1;
      const rot = saidify({
        v: versify('KERI', 0),
        t: 'rot' as const,
        d: '',
        i: icp.i,
        s: seq.toString(16),
        p: prior.d,
        kt: threshold.toString(16),
        k: next.map((m) => m.verfer),
        nt: threshold.toString(16),
        n: upcoming.map((m) => digestOfQb64(m.verfer)),
        bt: '0',
        br: [],
        ba: [],
        a: [],
      });

      // KERI rotation is signed by the newly-current keys.
      current = next;
      next = upcoming;
      estSeq = seq;
      kel.push({ event: rot as unknown as KelEvent, sigs: signAll(rot, current) });
    },
  };
}

function signaturesValid(signed: SignedKelEvent, state: KeyState): boolean {
  return verifyThreshold(state, signed.sigs, utf8ToBytes(JSON.stringify(signed.event)));
}

export function verifyKel(kel: readonly SignedKelEvent[]): boolean {
  const first = kel[0];
  if (first === undefined) return false;

  const icp = first.event;
  if (icp.t !== 'icp' || icp.s !== '0' || icp.i !== icp.d) return false;
  if (!verifySaid(icp as unknown as Ked, ['d', 'i'])) return false;
  if (!signaturesValid(first, eventKeyState(icp))) return false;

  let lastEst = icp;
  for (let at = 1; at < kel.length; at++) {
    const prev = kel[at - 1]!.event;
    const signed = kel[at]!;
    const rot = signed.event;

    if (rot.t !== 'rot' || rot.i !== icp.i) return false;
    if (parseInt(rot.s, 16) !== parseInt(prev.s, 16) + 1) return false;
    if (rot.p !== prev.d) return false;
    if (!verifySaid(rot as unknown as Ked)) return false;

    // Pre-rotation: every new key must match the per-index commitment made by
    // the last establishment event, and the committed threshold must hold.
    if (rot.k.length !== lastEst.n.length) return false;
    if (!rot.k.every((key, idx) => digestOfQb64(key) === lastEst.n[idx])) return false;
    if (parseInt(rot.kt, 16) !== parseInt(lastEst.nt, 16)) return false;
    if (!signaturesValid(signed, eventKeyState(rot))) return false;

    lastEst = rot;
  }

  return true;
}

export class KelStore {
  private readonly kels = new Map<string, readonly SignedKelEvent[]>();

  /** Registers a live reference: later rotations by the controller are visible. */
  register(kel: readonly SignedKelEvent[]): void {
    const aid = kel[0]?.event.i;
    if (aid === undefined || !verifyKel(kel)) {
      throw new Error('refusing to register an invalid KEL');
    }
    this.kels.set(aid, kel);
  }

  /** Re-verifies the whole KEL on every read; a tampered log resolves nothing. */
  keyStateAt(aid: string, seq: number): KeyState | undefined {
    const kel = this.kels.get(aid);
    if (kel === undefined || !verifyKel(kel)) return undefined;

    const establishment = kel.find(
      (signed) =>
        parseInt(signed.event.s, 16) === seq &&
        (signed.event.t === 'icp' || signed.event.t === 'rot'),
    );
    return establishment === undefined ? undefined : eventKeyState(establishment.event);
  }
}
