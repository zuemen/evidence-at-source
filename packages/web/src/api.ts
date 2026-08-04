/**
 * Browser-side demo adapter.
 *
 * The whole world — key generation, signing, verification — now runs in the
 * browser (isomorphic crypto), so this instantiates `createDemoWorld()` in-page
 * rather than fetching a server. The interface is unchanged, so the views do not
 * know or care. This is what makes the built site fully static *and* what makes
 * "the private key never leaves the device" literally true.
 */

import type { CredentialType } from '@eas/shared';
import {
  createDemoWorld,
  type AgentRole,
  type AttackDemoState,
  type DelegationState,
  type DemoSnapshot,
  type DemoWorld,
  type IntegrityDemoState,
  type SplitView,
  type VleiState,
} from './demo/world.js';

export interface DemoPayload {
  readonly snapshot: DemoSnapshot;
  readonly split: SplitView;
  readonly delegation: DelegationState;
  readonly vlei: VleiState;
  readonly attack: AttackDemoState;
  readonly integrity: IntegrityDemoState;
}

let worldPromise: Promise<DemoWorld> = createDemoWorld();

async function currentPayload(): Promise<DemoPayload> {
  const world = await worldPromise;
  return {
    snapshot: world.snapshot(),
    split: await world.split(),
    delegation: await world.delegationState(),
    vlei: world.vleiState(),
    attack: world.attackDemo(),
    integrity: world.integrityDemo(),
  };
}

export const api = {
  state: () => currentPayload(),
  attest: async (type: string) => {
    await (await worldPromise).attest(type as CredentialType);
    return currentPayload();
  },
  attestAll: async () => {
    await (await worldPromise).attestAll();
    return currentPayload();
  },
  revoke: async () => {
    (await worldPromise).revokeSubject();
    return currentPayload();
  },
  revokeAgent: async (role: AgentRole) => {
    (await worldPromise).revokeAgentDelegation(role);
    return currentPayload();
  },
  revokeQvi: async () => {
    (await worldPromise).revokeQvi();
    return currentPayload();
  },
  exportBundle: async (role: AgentRole) => (await worldPromise).exportAgentBundle(role),
  reset: async () => {
    worldPromise = createDemoWorld();
    return currentPayload();
  },
};
