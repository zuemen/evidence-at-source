/**
 * Transaction Event Logs — the revocation backbone of ACDC credentials.
 *
 * A registry is incepted with `vcp`; each credential gets an `iss` and at most
 * one `rev`. Status is derived by replaying the log, verifying each event's
 * SAID and controller signature; a single bad event makes the whole registry
 * answer `unknown`, never `issued`.
 */

import { utf8ToBytes } from '@eas/shared';
import { saidify, verifySaid, versify, type Ked } from './said.js';
import {
  KelStore,
  anchoredIn,
  keyStateIn,
  verifyThreshold,
  type AidController,
  type SignedKelEvent,
} from './kel.js';

export interface TelEvent {
  readonly v: string;
  readonly t: 'vcp' | 'iss' | 'rev';
  readonly d: string;
  readonly i: string;
  readonly s: string;
  readonly ri?: string;
  readonly ii?: string;
  readonly p?: string;
  readonly dt: string;
}

export interface SignedTelEvent {
  readonly event: TelEvent;
  readonly sigs: readonly string[];
  readonly sigSeq: number;
}

export type CredentialStatus = 'issued' | 'revoked' | 'unknown';

export class CredentialRegistry {
  readonly registryId: string;
  readonly events: SignedTelEvent[] = [];

  constructor(
    private readonly controller: AidController,
    dt: string = new Date().toISOString(),
  ) {
    const vcp = saidify(
      { v: versify('KERI', 0), t: 'vcp' as const, d: '', i: '', ii: controller.aid, s: '0', dt },
      ['d', 'i'],
    );
    this.registryId = vcp.i;
    this.append(vcp as unknown as TelEvent);
  }

  private append(event: TelEvent): void {
    // Anchor first: the KEL seal is what an old-key forger cannot produce.
    this.controller.anchor(event.d);
    const { sigs, sigSeq } = this.controller.sign(utf8ToBytes(JSON.stringify(event)));
    this.events.push({ event, sigs, sigSeq });
  }

  issue(credentialSaid: string, dt: string = new Date().toISOString()): void {
    const iss = saidify({
      v: versify('KERI', 0),
      t: 'iss' as const,
      d: '',
      i: credentialSaid,
      s: '0',
      ri: this.registryId,
      dt,
    });
    this.append(iss as unknown as TelEvent);
  }

  revoke(credentialSaid: string, dt: string = new Date().toISOString()): void {
    const issuance = this.events.find(
      (signed) => signed.event.t === 'iss' && signed.event.i === credentialSaid,
    );
    if (issuance === undefined) {
      throw new Error('cannot revoke a credential this registry never issued');
    }

    const rev = saidify({
      v: versify('KERI', 0),
      t: 'rev' as const,
      d: '',
      i: credentialSaid,
      s: '1',
      ri: this.registryId,
      p: issuance.event.d,
      dt,
    });
    this.append(rev as unknown as TelEvent);
  }
}

export class TelStore {
  private readonly registries = new Map<string, CredentialRegistry>();

  constructor(private readonly kels: KelStore) {}

  register(registry: CredentialRegistry): void {
    this.registries.set(registry.registryId, registry);
  }

  status(registryId: string, credentialSaid: string): CredentialStatus {
    const registry = this.registries.get(registryId);
    if (registry === undefined) return 'unknown';

    const controllerAid = registry.events[0]?.event.ii;
    if (controllerAid === undefined) return 'unknown';

    // The controller KEL is verified once per status query; every event check
    // below then works against that verified snapshot.
    const kel = this.kels.verifiedKel(controllerAid);
    if (kel === undefined) return 'unknown';

    let status: CredentialStatus = 'unknown';
    for (const signed of registry.events) {
      if (!this.eventValid(kel, signed)) return 'unknown';
      if (signed.event.t === 'iss' && signed.event.i === credentialSaid) status = 'issued';
      if (signed.event.t === 'rev' && signed.event.i === credentialSaid) status = 'revoked';
    }

    return status;
  }

  private eventValid(kel: readonly SignedKelEvent[], signed: SignedTelEvent): boolean {
    if (!anchoredIn(kel, signed.event.d)) return false;

    const labels = signed.event.t === 'vcp' ? ['d', 'i'] : ['d'];
    if (!verifySaid(signed.event as unknown as Ked, labels)) return false;

    const state = keyStateIn(kel, signed.sigSeq);
    if (state === undefined) return false;

    return verifyThreshold(state, signed.sigs, utf8ToBytes(JSON.stringify(signed.event)));
  }
}
