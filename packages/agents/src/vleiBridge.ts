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
  readonly jwk: PublicJwk;
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
      jwk: facts.credentialSigningJwk as PublicJwk,
    },
  };
}
