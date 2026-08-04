import { describe, expect, test } from 'vitest';
import { utf8ToBytes } from '@eas/shared';
import {
  CredentialRegistry,
  KelStore,
  TelStore,
  createAid,
  saidify,
  versify,
  type SignedTelEvent,
  type TelEvent,
} from '@eas/vlei';

function setup() {
  const kels = new KelStore();
  const tels = new TelStore(kels);
  const controller = createAid();
  kels.register(controller.kel);
  const registry = new CredentialRegistry(controller);
  tels.register(registry);
  return { kels, tels, controller, registry };
}

const CRED_SAID = 'E' + 'B'.repeat(43);

describe('TEL credential registry', () => {
  test('an unissued credential is unknown', () => {
    const { tels, registry } = setup();

    expect(tels.status(registry.registryId, CRED_SAID)).toBe('unknown');
  });

  test('issue then status reports issued', () => {
    const { tels, registry } = setup();
    registry.issue(CRED_SAID);

    expect(tels.status(registry.registryId, CRED_SAID)).toBe('issued');
  });

  test('revoke flips the status and cannot be undone by re-reading', () => {
    const { tels, registry } = setup();
    registry.issue(CRED_SAID);
    registry.revoke(CRED_SAID);

    expect(tels.status(registry.registryId, CRED_SAID)).toBe('revoked');
  });

  test('revoking an unissued credential throws', () => {
    const { registry } = setup();

    expect(() => registry.revoke(CRED_SAID)).toThrow();
  });

  test('an unknown registry id is unknown', () => {
    const { tels } = setup();

    expect(tels.status('E' + 'C'.repeat(43), CRED_SAID)).toBe('unknown');
  });

  test('a tampered TEL event fails closed to unknown', () => {
    const { tels, registry } = setup();
    registry.issue(CRED_SAID);

    const events = registry.events as SignedTelEvent[];
    const last = events[events.length - 1]!;
    events[events.length - 1] = {
      ...last,
      event: { ...last.event, dt: '1999-01-01T00:00:00Z' },
    };

    expect(tels.status(registry.registryId, CRED_SAID)).toBe('unknown');
  });

  test('registry survives controller key rotation for later events', () => {
    const { tels, controller, registry } = setup();
    registry.issue(CRED_SAID);
    controller.rotate();
    const second = 'E' + 'D'.repeat(43);
    registry.issue(second);

    expect(tels.status(registry.registryId, CRED_SAID)).toBe('issued');
    expect(tels.status(registry.registryId, second)).toBe('issued');
  });
});

describe('TEL anchoring in the controller KEL', () => {
  test('normal issuance is anchored and reports issued', () => {
    const { kels, tels, controller, registry } = setup();
    registry.issue(CRED_SAID);

    expect(kels.isAnchored(controller.aid, registry.events[1]!.event.d)).toBe(true);
    expect(tels.status(registry.registryId, CRED_SAID)).toBe('issued');
  });

  test('a validly-signed but unanchored event fails closed to unknown', () => {
    const { tels, controller, registry } = setup();
    registry.issue(CRED_SAID);

    // An attacker with the controller's signing keys forges a revocation but
    // cannot extend the KEL to anchor it.
    const forgedRev = saidify({
      v: versify('KERI', 0),
      t: 'rev' as const,
      d: '',
      i: CRED_SAID,
      s: '1',
      ri: registry.registryId,
      p: registry.events[1]!.event.d,
      dt: '2026-08-04T00:00:00Z',
    });
    const { sigs, sigSeq } = controller.sign(utf8ToBytes(JSON.stringify(forgedRev)));
    (registry.events as SignedTelEvent[]).push({
      event: forgedRev as unknown as TelEvent,
      sigs,
      sigSeq,
    });

    expect(tels.status(registry.registryId, CRED_SAID)).toBe('unknown');
  });
});
