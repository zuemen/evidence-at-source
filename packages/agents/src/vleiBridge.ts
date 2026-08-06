/**
 * The only door between the KERI/ACDC trust world and this repo's SD-JWT
 * world. Fine-grained VleiFailure codes stay inside @eas/vlei; whatever
 * crosses this bridge is a registered ReasonCode, carrying no field values.
 */

import {
  AI_AGENT_ROLE,
  verifyEcrChain,
  verifyLeChain,
  type VleiFailure,
  type VleiPresentation,
  type VleiTrustContext,
} from '@eas/vlei';
import type { PublicJwk, ReasonCode } from '@eas/shared';

/**
 * A signing key that is known to have arrived through a verified Legal Entity
 * vLEI chain. The marker is a module-private symbol, so the only way to obtain
 * a value of this type is to call resolveIssuerSigningKey and have the chain
 * verify — a bare JWK cannot be cast into one at runtime, and layer 1 checks
 * for the marker rather than trusting its caller.
 *
 * There is deliberately no test-only constructor: CLAUDE.md forbids gate
 * backdoors, so tests build a real chain like everything else does.
 */
const CHAIN_VERIFIED = Symbol('vlei.chainVerified');

export type IssuerSigningKey = PublicJwk & { readonly [CHAIN_VERIFIED]: true };

/**
 * The tier the chain grants this issuer, carried alongside the provenance
 * marker so that layer 1 can compare it against what a credential claims
 * without the gate's signature having to grow a parameter.
 */
const CHAIN_TIER = Symbol('eas.chainTier');

function admitIssuerKey(jwk: PublicJwk, chainTier?: string): IssuerSigningKey {
  // Non-enumerable on purpose: the marker is provenance, not key material. It
  // must not survive a spread, appear in JSON, or make an admitted key compare
  // unequal to the same key by value.
  const admitted = { ...jwk };
  Object.defineProperty(admitted, CHAIN_VERIFIED, { value: true, enumerable: false });
  Object.defineProperty(admitted, CHAIN_TIER, { value: chainTier, enumerable: false });

  return Object.freeze(admitted) as IssuerSigningKey;
}

/**
 * What the chain says this issuer is worth — 題06 Q1.
 *
 * Undefined means the Legal Entity credential carries no tier, which is the
 * QVI having vetted nothing beyond identity. That reads as the weakest tier,
 * never as "unconstrained".
 */
export function chainTierOf(key: IssuerSigningKey): string | undefined {
  return (key as unknown as Record<symbol, string | undefined>)[CHAIN_TIER];
}

/** Layer 1 asks this before it will use a key at all. */
export function isChainVerifiedKey(key: PublicJwk): key is IssuerSigningKey {
  return (key as Partial<IssuerSigningKey>)[CHAIN_VERIFIED] === true;
}

export interface AgentAuthority {
  readonly agentDid: string;
  readonly role: string;
  readonly lei: string;
  readonly principalDid: string;
  readonly principalLegalName: string;
  readonly delegationJwk: PublicJwk;
}

export type AgentAuthorityResult =
  | { readonly ok: true; readonly authority: AgentAuthority }
  | { readonly ok: false; readonly reason: ReasonCode };

function agentReason(failure: VleiFailure): ReasonCode {
  return failure === 'REGISTRY_REVOKED' ? 'AGENT_VLEI_REVOKED' : 'AGENT_VLEI_CHAIN_INVALID';
}

export function resolveAgentAuthority(
  presentation: VleiPresentation,
  trust: VleiTrustContext,
): AgentAuthorityResult {
  const verdict = verifyEcrChain(presentation, trust, AI_AGENT_ROLE);
  if (!verdict.ok) return { ok: false, reason: agentReason(verdict.failure) };

  const { facts } = verdict;
  return {
    ok: true,
    authority: {
      agentDid: facts.agentDid,
      role: facts.role,
      lei: facts.lei,
      principalDid: facts.legalEntity.didWeb,
      principalLegalName: facts.legalEntity.legalName,
      delegationJwk: facts.legalEntity.credentialSigningJwk as PublicJwk,
    },
  };
}

export interface IssuerIdentity {
  readonly didWeb: string;
  readonly legalName: string;
  readonly lei: string;
  readonly jwk: IssuerSigningKey;
}

export type IssuerIdentityResult =
  | { readonly ok: true; readonly issuer: IssuerIdentity }
  | { readonly ok: false; readonly reason: ReasonCode };

function issuerReason(failure: VleiFailure): ReasonCode {
  return failure === 'REGISTRY_REVOKED' ? 'ISSUER_VLEI_REVOKED' : 'ISSUER_VLEI_CHAIN_INVALID';
}

export function resolveIssuerSigningKey(
  presentation: VleiPresentation,
  trust: VleiTrustContext,
): IssuerIdentityResult {
  const verdict = verifyLeChain(presentation, trust);
  if (!verdict.ok) return { ok: false, reason: issuerReason(verdict.failure) };

  const { facts } = verdict;
  return {
    ok: true,
    issuer: {
      didWeb: facts.didWeb,
      legalName: facts.legalName,
      lei: facts.lei,
      jwk: admitIssuerKey(facts.credentialSigningJwk as PublicJwk, facts.issuerTier),
    },
  };
}

/**
 * The throwing form, for call sites that have no meaningful way to continue
 * without the key (demo wiring, tests). Failing loudly is correct here: a
 * caller that swallowed this would be back to trusting an unverified key.
 */
export function requireIssuerSigningKey(
  presentation: VleiPresentation,
  trust: VleiTrustContext,
): IssuerSigningKey {
  const resolved = resolveIssuerSigningKey(presentation, trust);
  if (!resolved.ok) throw new Error(`issuer vLEI chain rejected: ${resolved.reason}`);

  return resolved.issuer.jwk;
}
