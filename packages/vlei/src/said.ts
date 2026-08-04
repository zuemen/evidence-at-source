/**
 * Self-Addressing IDentifiers (SAID) over KERI-style serializations.
 *
 * The two-pass rule: set every said label to a 44-char dummy, fix the version
 * string size against that dummy serialization (the real digest has the same
 * length, so the size is stable), digest with Blake3-256, then fill the labels.
 * Verification re-runs the same passes and compares.
 */

import { blake3 } from '@noble/hashes/blake3';
import { utf8ToBytes } from '@eas/shared';
import { MATTER_CODES, encodeMatter } from './cesr.js';

export type Ked = Record<string, unknown>;

export const SAID_DUMMY = '#'.repeat(44);

export function versify(proto: 'KERI' | 'ACDC', size: number): string {
  return `${proto}10JSON${size.toString(16).padStart(6, '0')}_`;
}

function dummied(ked: Ked, labels: readonly string[]): Ked {
  const working: Ked = { ...ked };
  for (const label of labels) working[label] = SAID_DUMMY;

  const version = ked['v'];
  if (typeof version === 'string') {
    const proto = version.startsWith('ACDC') ? 'ACDC' : 'KERI';
    working['v'] = versify(proto, 0);
    working['v'] = versify(proto, utf8ToBytes(JSON.stringify(working)).length);
  }

  return working;
}

export function saidify<T extends Ked>(ked: T, labels: readonly string[] = ['d']): T {
  const working = dummied(ked, labels);
  const digest = blake3(utf8ToBytes(JSON.stringify(working)), { dkLen: 32 });
  const said = encodeMatter(MATTER_CODES.Blake3_256, digest);

  const out: Ked = { ...working };
  for (const label of labels) out[label] = said;

  return out as T;
}

export function verifySaid(ked: Ked, labels: readonly string[] = ['d']): boolean {
  const first = labels[0];
  if (first === undefined) return false;

  const said = ked[first];
  if (typeof said !== 'string') return false;
  if (!labels.every((label) => ked[label] === said)) return false;

  const recomputed = saidify(ked, labels);
  return recomputed[first] === said && JSON.stringify(recomputed) === JSON.stringify(ked);
}
