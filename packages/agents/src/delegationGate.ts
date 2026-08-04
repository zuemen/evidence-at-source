/**
 * Policy Gate layer 0 — the agent-authorization layer.
 *
 * Before the gate reads a single worker claim, it establishes on whose authority
 * the agent is asking: is there a delegation, is there an ECR vLEI chain proving
 * the institution is a real legal entity and this agent its appointed verifier,
 * is the delegation validly signed by the chain-published key, is it current,
 * was it revoked, and does it cover this query type and this credential type.
 * Only when all of that holds does worker data get touched — a property
 * `runAuthorizedGate` makes structural, not merely stated.
 */

import {
  base64urlToUtf8,
  credentialHash,
  verifyPresentation,
  type AllowedQueryType,
  type DelegationClaims,
  type ReasonCode,
  type RevocationRegistry,
} from '@eas/shared';
import type { VleiPresentation, VleiTrustContext } from '@eas/vlei';
import { resolveAgentAuthority, type AgentAuthority } from './vleiBridge.js';

export interface DelegationContext {
  /** The agent's signed DelegationCredential, or null if it presented none. */
  readonly signedDelegation: string | null;
  /** ACDC chain proving the agent's ECR authority, or null if none presented. */
  readonly agentVlei: VleiPresentation | null;
  /** GLEIF root, KELs and TELs the verifier trusts. */
  readonly trust: VleiTrustContext;
  readonly requestedQueryType: AllowedQueryType;
  readonly requestedCredentialType: string;
  /** Delegation revocations, keyed by agent DID. */
  readonly revocations?: RevocationRegistry;
}

export type DelegationDecision =
  | { readonly ok: true; readonly claims: DelegationClaims; readonly authority: AgentAuthority }
  | { readonly ok: false; readonly reason: ReasonCode };

interface UnverifiedDelegation {
  readonly exp?: number;
}

function readUnverified(signed: string): UnverifiedDelegation {
  const claimsSegment = (signed.split('~')[0] ?? '').split('.')[1];
  if (claimsSegment === undefined) return {};

  try {
    const decoded = JSON.parse(base64urlToUtf8(claimsSegment)) as Record<string, unknown>;

    return {
      exp: typeof decoded['exp'] === 'number' ? decoded['exp'] : undefined,
    };
  } catch {
    return {};
  }
}

function toClaims(payload: Record<string, unknown>): DelegationClaims {
  const queryTypes = Array.isArray(payload['allowedQueryTypes'])
    ? (payload['allowedQueryTypes'] as AllowedQueryType[])
    : [];
  const scope = Array.isArray(payload['scope']) ? (payload['scope'] as string[]) : [];

  return {
    principal: String(payload['principal']),
    principalName: String(payload['principalName']),
    agentDid: String(payload['agentDid']),
    allowedQueryTypes: queryTypes,
    scope,
    purpose: String(payload['purpose']),
    iat: Number(payload['iat']),
    exp: Number(payload['exp']),
  };
}

export interface DelegationValidityInput {
  readonly signedDelegation: string | null;
  readonly agentVlei: VleiPresentation | null;
  readonly trust: VleiTrustContext;
  readonly revocations?: RevocationRegistry;
}

/**
 * The query-independent half of L0: is the delegation present, is the agent's
 * vLEI chain valid, does the delegation verify against the chain-published key,
 * is it current, and is it not revoked. The worker's wallet uses this on its
 * own to decide whether to trust an agent at all, before any query.
 */
export async function verifyDelegationValidity(
  input: DelegationValidityInput,
): Promise<DelegationDecision> {
  if (input.signedDelegation === null) {
    return { ok: false, reason: 'AGENT_DELEGATION_MISSING' };
  }
  if (input.agentVlei === null) {
    return { ok: false, reason: 'AGENT_VLEI_MISSING' };
  }

  // On whose authority: the ECR chain must verify up to the GLEIF root before
  // the delegation signature is even looked at. The signing key comes from the
  // chain, never from configuration.
  const resolved = resolveAgentAuthority(input.agentVlei, input.trust);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  const { authority } = resolved;

  let claims: DelegationClaims;
  try {
    const verified = await verifyPresentation(input.signedDelegation, authority.delegationJwk);
    claims = toClaims(verified.payload);
  } catch {
    // Verification fails on both a bad signature and an expired credential; the
    // expiry check separates the two so the reason code is truthful.
    const unverified = readUnverified(input.signedDelegation);
    if (unverified.exp !== undefined && unverified.exp * 1000 < Date.now()) {
      return { ok: false, reason: 'AGENT_DELEGATION_EXPIRED' };
    }
    return { ok: false, reason: 'AGENT_DELEGATION_INVALID' };
  }

  // The SD-JWT and the ACDC chain must speak about the same agent and the
  // same institution, or the pairing proves nothing.
  if (claims.principal !== authority.principalDid || claims.agentDid !== authority.agentDid) {
    return { ok: false, reason: 'AGENT_VLEI_BINDING_MISMATCH' };
  }

  // Belt and braces: reject an expired delegation even if verification let it by.
  if (claims.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'AGENT_DELEGATION_EXPIRED' };
  }

  const revoked = input.revocations?.isRevoked({
    credentialHash: credentialHash(input.signedDelegation),
    workerDID: claims.agentDid,
  });
  if (revoked === true) {
    return { ok: false, reason: 'AGENT_DELEGATION_REVOKED' };
  }

  return { ok: true, claims, authority };
}

export async function checkAgentDelegation(ctx: DelegationContext): Promise<DelegationDecision> {
  const validity = await verifyDelegationValidity(ctx);
  if (!validity.ok) {
    return validity;
  }

  const { claims, authority } = validity;

  if (!claims.allowedQueryTypes.includes(ctx.requestedQueryType)) {
    return { ok: false, reason: 'QUERY_TYPE_NOT_IN_SCOPE' };
  }

  if (!claims.scope.includes(ctx.requestedCredentialType)) {
    return { ok: false, reason: 'CREDENTIAL_TYPE_NOT_IN_SCOPE' };
  }

  return { ok: true, claims, authority };
}

export type AuthorizedGateResult<T> =
  | { readonly ok: false; readonly layer: 'L0'; readonly reason: ReasonCode }
  | { readonly ok: true; readonly claims: DelegationClaims; readonly worker: T };

/**
 * Runs L0, and only if it passes, the worker-facing layers. The worker layers
 * are a callback, so a caller can prove — by spying on it — that a failed L0
 * never reads worker data.
 */
export async function runAuthorizedGate<T>(
  ctx: DelegationContext,
  runWorkerLayers: () => Promise<T>,
): Promise<AuthorizedGateResult<T>> {
  const l0 = await checkAgentDelegation(ctx);
  if (!l0.ok) {
    return { ok: false, layer: 'L0', reason: l0.reason };
  }

  const worker = await runWorkerLayers();

  return { ok: true, claims: l0.claims, worker };
}
