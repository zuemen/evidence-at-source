import { describe, expect, test } from 'vitest';
import { utf8ToBytes } from '@eas/shared';
import { saidify, verifySaid, versify } from '@eas/vlei';

describe('SAID computation', () => {
  test('saidify fills the d label with a 44-char E-prefixed digest and verifySaid accepts it', () => {
    const ked = saidify({ v: versify('KERI', 0), t: 'icp', d: '', s: '0', k: ['DAAA'] });

    expect(ked.d).toHaveLength(44);
    expect(String(ked.d).startsWith('E')).toBe(true);
    expect(verifySaid(ked)).toBe(true);
  });

  test('the version string size field matches the actual serialized length', () => {
    const ked = saidify({ v: versify('KERI', 0), t: 'icp', d: '', s: '0', k: ['DAAA'] });
    const size = parseInt(String(ked.v).slice('KERI10JSON'.length, -1), 16);

    expect(size).toBe(utf8ToBytes(JSON.stringify(ked)).length);
  });

  test('saidify is deterministic and content-sensitive', () => {
    const a = saidify({ v: versify('ACDC', 0), d: '', x: 1 });
    const b = saidify({ v: versify('ACDC', 0), d: '', x: 1 });
    const c = saidify({ v: versify('ACDC', 0), d: '', x: 2 });

    expect(a.d).toBe(b.d);
    expect(a.d).not.toBe(c.d);
  });

  test('mutating any field after saidify breaks verification', () => {
    const ked = saidify({ v: versify('KERI', 0), t: 'icp', d: '', s: '0', k: ['DAAA'] });

    expect(verifySaid({ ...ked, s: '1' })).toBe(false);
    expect(verifySaid({ ...ked, d: 'E' + 'A'.repeat(43) })).toBe(false);
  });

  test('multi-label saidify (icp d+i, schema $id) sets every label to the same digest', () => {
    const icp = saidify({ v: versify('KERI', 0), t: 'icp', d: '', i: '', s: '0' }, ['d', 'i']);
    const schema = saidify({ $id: '', title: 'X' }, ['$id']);

    expect(icp.d).toBe(icp.i);
    expect(verifySaid(icp, ['d', 'i'])).toBe(true);
    expect(verifySaid(schema, ['$id'])).toBe(true);
  });

  test('a ked without a v field (nested blocks) still gets a stable said', () => {
    const block = saidify({ d: '', i: 'did:key:zWorker001', dt: '2026-08-04T00:00:00Z' });

    expect(verifySaid(block)).toBe(true);
  });
});
