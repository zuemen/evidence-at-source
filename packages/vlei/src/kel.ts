/**
 * Single-signature KERI key event logs with pre-rotation.
 *
 * An AID is the SAID of its inception event. Every rotation must present keys
 * whose digest was committed in the previous establishment event's `n` field,
 * so a key compromised today cannot rewrite tomorrow's history. No witnesses,
 * no delegation — documented PoC simplifications.
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
  readonly sig: string;
}

export interface AidController {
  readonly aid: string;
  readonly kel: readonly SignedKelEvent[];
  currentVerfer(): string;
  sign(data: Uint8Array): { sig: string; sigSeq: number };
  rotate(): void;
}

function signEvent(event: Ked, secret: Uint8Array): string {
  return encodeMatter(
    MATTER_CODES.Ed25519_Sig,
    ed25519.sign(utf8ToBytes(JSON.stringify(event)), secret),
  );
}

export function createAid(): AidController {
  let current = createKeyMaterial();
  let next = createKeyMaterial();
  const kel: SignedKelEvent[] = [];

  const icp = saidify(
    {
      v: versify('KERI', 0),
      t: 'icp' as const,
      d: '',
      i: '',
      s: '0',
      kt: '1',
      k: [current.verfer],
      nt: '1',
      n: [digestOfQb64(next.verfer)],
      bt: '0',
      b: [],
      c: [],
      a: [],
    },
    ['d', 'i'],
  );
  kel.push({ event: icp as unknown as KelEvent, sig: signEvent(icp, current.secret) });

  return {
    aid: icp.i,
    kel,
    currentVerfer: () => current.verfer,

    sign(data) {
      const latest = kel[kel.length - 1]!.event;
      return {
        sig: encodeMatter(MATTER_CODES.Ed25519_Sig, ed25519.sign(data, current.secret)),
        sigSeq: parseInt(latest.s, 16),
      };
    },

    rotate() {
      const upcoming = createKeyMaterial();
      const prior = kel[kel.length - 1]!.event;
      const rot = saidify({
        v: versify('KERI', 0),
        t: 'rot' as const,
        d: '',
        i: icp.i,
        s: (parseInt(prior.s, 16) + 1).toString(16),
        p: prior.d,
        kt: '1',
        k: [next.verfer],
        nt: '1',
        n: [digestOfQb64(upcoming.verfer)],
        bt: '0',
        br: [],
        ba: [],
        a: [],
      });

      // KERI rotation is signed by the newly-current keys.
      current = next;
      next = upcoming;
      kel.push({ event: rot as unknown as KelEvent, sig: signEvent(rot, current.secret) });
    },
  };
}

function signatureValid(signed: SignedKelEvent): boolean {
  const verfer = signed.event.k[0];
  if (verfer === undefined) return false;

  return ed25519.verify(
    decodeMatter(signed.sig).raw,
    utf8ToBytes(JSON.stringify(signed.event)),
    decodeMatter(verfer).raw,
  );
}

export function verifyKel(kel: readonly SignedKelEvent[]): boolean {
  const first = kel[0];
  if (first === undefined) return false;

  const icp = first.event;
  if (icp.t !== 'icp' || icp.s !== '0' || icp.i !== icp.d) return false;
  if (!verifySaid(icp as unknown as Ked, ['d', 'i'])) return false;
  if (!signatureValid(first)) return false;

  for (let at = 1; at < kel.length; at++) {
    const prev = kel[at - 1]!.event;
    const signed = kel[at]!;
    const rot = signed.event;

    if (rot.t !== 'rot' || rot.i !== icp.i) return false;
    if (parseInt(rot.s, 16) !== parseInt(prev.s, 16) + 1) return false;
    if (rot.p !== prev.d) return false;
    if (!verifySaid(rot as unknown as Ked)) return false;

    // Pre-rotation: the new key must have been committed by the prior event.
    const newKey = rot.k[0];
    if (newKey === undefined || digestOfQb64(newKey) !== prev.n[0]) return false;
    if (!signatureValid(signed)) return false;
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
  verferAt(aid: string, seq: number): string | undefined {
    const kel = this.kels.get(aid);
    if (kel === undefined || !verifyKel(kel)) return undefined;

    const establishment = kel.find((signed) => parseInt(signed.event.s, 16) === seq);
    return establishment?.event.k[0];
  }
}
