/**
 * Authentic Chained Data Containers. An ACDC here is the JSON compact form:
 * v/d envelope, issuer AID `i`, registry `ri`, schema SAID `s`, saidified
 * attribute block `a`, optional saidified edge block `e`, and the official
 * rules block `r`. The signature is carried alongside with the establishment
 * seq of the issuing key, so verification pins to the right key across
 * rotations.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@eas/shared';
import { decodeMatter } from './cesr.js';
import { saidify, verifySaid, versify, type Ked } from './said.js';
import { KelStore, type AidController } from './kel.js';
import { CredentialRegistry, TelStore } from './tel.js';
import {
  VLEI_RULES,
  schemaBySaid,
  schemaSaid,
  validateAttributes,
  type VleiSchemaName,
} from './schemas.js';

export interface AcdcEdge {
  readonly n: string;
  readonly s: string;
}

export interface Acdc {
  readonly v: string;
  readonly d: string;
  readonly i: string;
  readonly ri: string;
  readonly s: string;
  readonly a: Record<string, unknown>;
  readonly e?: Record<string, unknown>;
  readonly r: Record<string, unknown>;
}

export interface SignedAcdc {
  readonly acdc: Acdc;
  readonly sig: string;
  readonly sigSeq: number;
}

export interface IssueAcdcInput {
  readonly issuer: AidController;
  readonly registry: CredentialRegistry;
  readonly schema: VleiSchemaName;
  readonly subject: string;
  readonly claims: Record<string, unknown>;
  readonly edges?: Record<string, AcdcEdge>;
  readonly dt?: string;
}

export function issueAcdc(input: IssueAcdcInput): SignedAcdc {
  const dt = input.dt ?? new Date().toISOString();

  const attributes = saidify({ d: '', i: input.subject, dt, ...input.claims });
  const edges = input.edges === undefined ? undefined : saidify({ d: '', ...input.edges });

  const body: Ked = {
    v: versify('ACDC', 0),
    d: '',
    i: input.issuer.aid,
    ri: input.registry.registryId,
    s: schemaSaid(input.schema),
    a: attributes,
  };
  if (edges !== undefined) body['e'] = edges;
  body['r'] = VLEI_RULES;

  const acdc = saidify(body) as unknown as Acdc;
  input.registry.issue(acdc.d, dt);

  const { sig, sigSeq } = input.issuer.sign(utf8ToBytes(JSON.stringify(acdc)));
  return { acdc, sig, sigSeq };
}

export type AcdcFailure =
  | 'SAID_MISMATCH'
  | 'SCHEMA_UNKNOWN'
  | 'ATTRIBUTE_INVALID'
  | 'SIGNATURE_INVALID'
  | 'REGISTRY_UNKNOWN'
  | 'REGISTRY_REVOKED';

export interface AcdcTrust {
  readonly kels: KelStore;
  readonly tels: TelStore;
}

export function verifyAcdc(
  signed: SignedAcdc,
  trust: AcdcTrust,
): { ok: true } | { ok: false; failure: AcdcFailure } {
  const { acdc } = signed;

  if (!verifySaid(acdc as unknown as Ked)) return { ok: false, failure: 'SAID_MISMATCH' };
  if (!verifySaid(acdc.a)) return { ok: false, failure: 'SAID_MISMATCH' };
  if (acdc.e !== undefined && !verifySaid(acdc.e)) {
    return { ok: false, failure: 'SAID_MISMATCH' };
  }

  const schema = schemaBySaid(acdc.s);
  if (schema === undefined) return { ok: false, failure: 'SCHEMA_UNKNOWN' };
  if (!validateAttributes(schema.name, acdc.a)) {
    return { ok: false, failure: 'ATTRIBUTE_INVALID' };
  }

  const verfer = trust.kels.verferAt(acdc.i, signed.sigSeq);
  if (verfer === undefined) return { ok: false, failure: 'SIGNATURE_INVALID' };
  const signatureOk = ed25519.verify(
    decodeMatter(signed.sig).raw,
    utf8ToBytes(JSON.stringify(acdc)),
    decodeMatter(verfer).raw,
  );
  if (!signatureOk) return { ok: false, failure: 'SIGNATURE_INVALID' };

  const status = trust.tels.status(acdc.ri, acdc.d);
  if (status === 'revoked') return { ok: false, failure: 'REGISTRY_REVOKED' };
  if (status !== 'issued') return { ok: false, failure: 'REGISTRY_UNKNOWN' };

  return { ok: true };
}
