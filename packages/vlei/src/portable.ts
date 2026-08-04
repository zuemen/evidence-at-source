/**
 * Portable chain artifacts — the PoC's stand-in for OOBI/CESR streams.
 *
 * A presentation travels as one JSON string carrying the ACDCs plus every KEL
 * and TEL a verifier needs. The only thing obtained out-of-band is the root
 * AID: import rebuilds fresh stores, re-verifying every KEL on registration
 * and every TEL event on read. Nothing in the bundle is trusted as-is.
 */

import { KelStore, type SignedKelEvent } from './kel.js';
import { TelStore, type SignedTelEvent } from './tel.js';
import type { VleiPresentation, VleiTrustContext } from './chain.js';

export interface ChainArtifacts {
  readonly presentation: VleiPresentation;
  readonly kels: Readonly<Record<string, readonly SignedKelEvent[]>>;
  readonly tels: Readonly<Record<string, readonly SignedTelEvent[]>>;
}

export function exportChainArtifacts(
  presentation: VleiPresentation,
  trust: VleiTrustContext,
): string {
  const kels: Record<string, readonly SignedKelEvent[]> = {};
  const tels: Record<string, readonly SignedTelEvent[]> = {};

  for (const signed of Object.values(presentation.credentials)) {
    if (signed === undefined) continue;

    const kel = trust.kels.kelOf(signed.acdc.i);
    if (kel === undefined) throw new Error('missing KEL for a credential issuer');
    kels[signed.acdc.i] = kel;

    const events = trust.tels.eventsOf(signed.acdc.ri);
    if (events === undefined) throw new Error('missing TEL for a credential registry');
    tels[signed.acdc.ri] = events;
  }

  return JSON.stringify({ presentation, kels, tels } satisfies ChainArtifacts);
}

export function importVerifierContext(
  serialized: string,
  trustedRoots: ReadonlySet<string>,
): { presentation: VleiPresentation; trust: VleiTrustContext } {
  const artifacts = JSON.parse(serialized) as ChainArtifacts;

  const kels = new KelStore();
  for (const kel of Object.values(artifacts.kels)) {
    kels.register(kel); // throws on any invalid KEL — nothing partial survives
  }

  const tels = new TelStore(kels);
  for (const [registryId, events] of Object.entries(artifacts.tels)) {
    tels.registerEvents(registryId, events);
  }

  return { presentation: artifacts.presentation, trust: { trustedRoots, kels, tels } };
}
