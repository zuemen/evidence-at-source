/**
 * Walking a vLEI chain: ECR → (edge le) → Legal Entity → (edge qvi) → QVI,
 * whose issuer must be a trusted root (GLEIF). Every hop re-verifies SAIDs,
 * signatures against the issuer's KEL, TEL status, schema identity and LEI
 * consistency — so revoking any upstream credential collapses everything
 * beneath it at the next verification.
 */

import { KelStore } from './kel.js';
import { TelStore } from './tel.js';
import { isValidLei } from './lei.js';
import { schemaSaid, type VleiSchemaName } from './schemas.js';
import { verifyAcdc, type AcdcEdge, type AcdcFailure, type SignedAcdc } from './acdc.js';

export interface VleiTrustContext {
  readonly trustedRoots: ReadonlySet<string>;
  readonly kels: KelStore;
  readonly tels: TelStore;
}

export interface VleiPresentation {
  readonly focus: string;
  readonly credentials: Readonly<Record<string, SignedAcdc | undefined>>;
}

export type VleiFailure =
  | AcdcFailure
  | 'SCHEMA_MISMATCH'
  | 'EDGE_MISSING'
  | 'CHAIN_ISSUER_MISMATCH'
  | 'ROOT_UNTRUSTED'
  | 'LEI_INVALID'
  | 'LEI_MISMATCH'
  | 'ROLE_MISMATCH';

export const AI_AGENT_ROLE = 'ai-verification-agent';

/**
 * The ECR role a third-party audit body holds — 題06 Q1's middle tier.
 *
 * A T2 credential names the body that backed it. Without a chain behind that
 * name, "third-party verified" is a string the issuer typed about itself, and
 * naming a real auditor is indistinguishable from naming an invented one.
 */
export const AUDITOR_ROLE = 'third-party-auditor';

export interface LegalEntityFacts {
  readonly aid: string;
  readonly lei: string;
  readonly legalName: string;
  readonly didWeb: string;
  readonly credentialSigningJwk: Record<string, unknown>;
  /** Absent means the QVI vetted nothing: the weakest tier, not an error. */
  readonly issuerTier: string | undefined;
}

export interface AgentAuthorityFacts {
  readonly agentDid: string;
  readonly role: string;
  readonly lei: string;
  readonly legalEntity: LegalEntityFacts;
}

export type ChainResult<T> =
  | { readonly ok: true; readonly facts: T }
  | { readonly ok: false; readonly failure: VleiFailure };

function fail<T>(failure: VleiFailure): ChainResult<T> {
  return { ok: false, failure };
}

function resolve(p: VleiPresentation, said: string): SignedAcdc | undefined {
  const found = p.credentials[said];
  return found !== undefined && found.acdc.d === said ? found : undefined;
}

function checkAcdc(
  signed: SignedAcdc,
  trust: VleiTrustContext,
  expected: VleiSchemaName,
): VleiFailure | null {
  const verdict = verifyAcdc(signed, trust);
  if (!verdict.ok) return verdict.failure;
  if (signed.acdc.s !== schemaSaid(expected)) return 'SCHEMA_MISMATCH';
  return null;
}

function readEdge(signed: SignedAcdc, name: string): AcdcEdge | undefined {
  const edge = signed.acdc.e?.[name];
  if (typeof edge !== 'object' || edge === null) return undefined;
  const { n, s } = edge as { n?: unknown; s?: unknown };
  return typeof n === 'string' && typeof s === 'string' ? { n, s } : undefined;
}

export function verifyLeChain(
  p: VleiPresentation,
  trust: VleiTrustContext,
): ChainResult<LegalEntityFacts> {
  const le = resolve(p, p.focus);
  if (le === undefined) return fail('EDGE_MISSING');

  const leFailure = checkAcdc(le, trust, 'legalEntity');
  if (leFailure !== null) return fail(leFailure);

  const edge = readEdge(le, 'qvi');
  if (edge === undefined) return fail('EDGE_MISSING');
  if (edge.s !== schemaSaid('qvi')) return fail('SCHEMA_MISMATCH');

  const qvi = resolve(p, edge.n);
  if (qvi === undefined) return fail('EDGE_MISSING');

  const qviFailure = checkAcdc(qvi, trust, 'qvi');
  if (qviFailure !== null) return fail(qviFailure);

  if (!trust.trustedRoots.has(qvi.acdc.i)) return fail('ROOT_UNTRUSTED');
  if (le.acdc.i !== qvi.acdc.a['i']) return fail('CHAIN_ISSUER_MISMATCH');

  const lei = le.acdc.a['LEI'];
  const qviLei = qvi.acdc.a['LEI'];
  if (typeof lei !== 'string' || !isValidLei(lei)) return fail('LEI_INVALID');
  if (typeof qviLei !== 'string' || !isValidLei(qviLei)) return fail('LEI_INVALID');

  return {
    ok: true,
    facts: {
      aid: String(le.acdc.a['i']),
      lei,
      legalName: String(le.acdc.a['legalName']),
      didWeb: String(le.acdc.a['didWeb']),
      credentialSigningJwk: le.acdc.a['credentialSigningJwk'] as Record<string, unknown>,
      issuerTier:
        typeof le.acdc.a['issuerTier'] === 'string' ? le.acdc.a['issuerTier'] : undefined,
    },
  };
}

export interface OfficialRoleFacts {
  readonly personDid: string;
  readonly personLegalName: string;
  readonly officialRole: string;
  readonly lei: string;
  readonly legalEntity: LegalEntityFacts;
}

/**
 * The chain behind a person holding an official role — 題06 Q4.
 *
 * An ECR says which agent may act for an organisation. An OOR says which
 * *person* holds which office in it. The system already refuses to let an
 * agent decide anything on its own ("建議核准，待人類覆核"), which makes the
 * reviewer the one party whose authority actually settles a case — and until
 * now the only one with no standing in the evidence chain at all.
 *
 * Revocation carries the same meaning it does everywhere else: a reviewer who
 * has left keeps whatever they signed while in post, and can sign nothing new.
 */
export function verifyOorChain(
  p: VleiPresentation,
  trust: VleiTrustContext,
  expectedRole: string,
): ChainResult<OfficialRoleFacts> {
  const oor = resolve(p, p.focus);
  if (oor === undefined) return fail('EDGE_MISSING');

  const oorFailure = checkAcdc(oor, trust, 'oor');
  if (oorFailure !== null) return fail(oorFailure);

  const edge = readEdge(oor, 'le');
  if (edge === undefined) return fail('EDGE_MISSING');
  if (edge.s !== schemaSaid('legalEntity')) return fail('SCHEMA_MISMATCH');

  const leVerdict = verifyLeChain({ focus: edge.n, credentials: p.credentials }, trust);
  if (!leVerdict.ok) return fail(leVerdict.failure);

  if (oor.acdc.i !== leVerdict.facts.aid) return fail('CHAIN_ISSUER_MISMATCH');
  if (oor.acdc.a['LEI'] !== leVerdict.facts.lei) return fail('LEI_MISMATCH');
  if (oor.acdc.a['officialRole'] !== expectedRole) return fail('ROLE_MISMATCH');

  return {
    ok: true,
    facts: {
      personDid: String(oor.acdc.a['i']),
      personLegalName: String(oor.acdc.a['personLegalName']),
      officialRole: expectedRole,
      lei: leVerdict.facts.lei,
      legalEntity: leVerdict.facts,
    },
  };
}

export function verifyEcrChain(
  p: VleiPresentation,
  trust: VleiTrustContext,
  expectedRole: string = AI_AGENT_ROLE,
): ChainResult<AgentAuthorityFacts> {
  const ecr = resolve(p, p.focus);
  if (ecr === undefined) return fail('EDGE_MISSING');

  const ecrFailure = checkAcdc(ecr, trust, 'ecr');
  if (ecrFailure !== null) return fail(ecrFailure);

  const edge = readEdge(ecr, 'le');
  if (edge === undefined) return fail('EDGE_MISSING');
  if (edge.s !== schemaSaid('legalEntity')) return fail('SCHEMA_MISMATCH');

  const leVerdict = verifyLeChain({ focus: edge.n, credentials: p.credentials }, trust);
  if (!leVerdict.ok) return fail(leVerdict.failure);

  if (ecr.acdc.i !== leVerdict.facts.aid) return fail('CHAIN_ISSUER_MISMATCH');
  if (ecr.acdc.a['LEI'] !== leVerdict.facts.lei) return fail('LEI_MISMATCH');

  const role = ecr.acdc.a['engagementContextRole'];
  if (role !== expectedRole) return fail('ROLE_MISMATCH');

  return {
    ok: true,
    facts: {
      agentDid: String(ecr.acdc.a['agentDid']),
      role: expectedRole,
      lei: leVerdict.facts.lei,
      legalEntity: leVerdict.facts,
    },
  };
}
