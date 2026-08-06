/**
 * PoC profiles of the four vLEI credential schemas. Official credentialType
 * names are kept; the $id is a SAID computed over this profile (not GLEIF's
 * registered SAID). Extension fields beyond the official schemas: legalEntity
 * carries didWeb + credentialSigningJwk and ecr carries agentDid — the bridge
 * that binds the KERI trust chain to this repo's SD-JWT world.
 */

import { saidify } from './said.js';

export type VleiSchemaName = 'qvi' | 'legalEntity' | 'oor' | 'ecr';

export interface AttributeSpec {
  readonly required: readonly string[];
  readonly types: Readonly<Record<string, 'string' | 'object'>>;
}

export interface VleiSchema {
  readonly $id: string;
  readonly $schema: string;
  readonly title: string;
  readonly description: string;
  readonly credentialType: string;
  readonly attributes: AttributeSpec;
}

function makeSchema(input: Omit<VleiSchema, '$id' | '$schema'>): VleiSchema {
  return saidify(
    {
      $id: '',
      $schema: 'http://json-schema.org/draft-07/schema#',
      ...input,
    },
    ['$id'],
  ) as unknown as VleiSchema;
}

export const VLEI_SCHEMAS: Record<VleiSchemaName, VleiSchema> = {
  qvi: makeSchema({
    title: 'Qualified vLEI Issuer Credential',
    description:
      'Issued by GLEIF to a Qualified vLEI Issuer, authorizing it to issue Legal Entity vLEI credentials. PoC profile.',
    credentialType: 'QualifiedvLEIIssuervLEICredential',
    attributes: { required: ['LEI'], types: { LEI: 'string' } },
  }),
  legalEntity: makeSchema({
    title: 'Legal Entity vLEI Credential',
    description:
      'Issued by a QVI to a Legal Entity. PoC profile; didWeb and credentialSigningJwk are extension fields binding the entity to its SD-JWT signing identity, and issuerTier records the vetting the QVI actually performed.',
    credentialType: 'LegalEntityvLEICredential',
    attributes: {
      // issuerTier is not required: a Legal Entity credential issued without
      // one means the QVI vetted nothing beyond identity, and absence must
      // read as the weakest tier rather than as an error.
      required: ['LEI', 'legalName', 'didWeb', 'credentialSigningJwk'],
      types: {
        LEI: 'string',
        legalName: 'string',
        didWeb: 'string',
        credentialSigningJwk: 'object',
        issuerTier: 'string',
      },
    },
  }),
  oor: makeSchema({
    title: 'Legal Entity Official Organizational Role vLEI Credential',
    description: 'Issued to a person holding an official role at a Legal Entity. PoC profile.',
    credentialType: 'LegalEntityOfficialOrganizationalRolevLEICredential',
    attributes: {
      required: ['LEI', 'personLegalName', 'officialRole'],
      types: { LEI: 'string', personLegalName: 'string', officialRole: 'string' },
    },
  }),
  ecr: makeSchema({
    title: 'Legal Entity Engagement Context Role vLEI Credential',
    description:
      'Issued by a Legal Entity for a context-specific role. PoC profile; agentDid is an extension field naming the AI agent this role empowers.',
    credentialType: 'LegalEntityEngagementContextRolevLEICredential',
    attributes: {
      required: ['LEI', 'agentDid', 'engagementContextRole'],
      types: { LEI: 'string', agentDid: 'string', engagementContextRole: 'string' },
    },
  }),
};

export function schemaSaid(name: VleiSchemaName): string {
  return VLEI_SCHEMAS[name].$id;
}

export function schemaBySaid(
  said: string,
): { name: VleiSchemaName; schema: VleiSchema } | undefined {
  for (const name of Object.keys(VLEI_SCHEMAS) as VleiSchemaName[]) {
    if (VLEI_SCHEMAS[name].$id === said) return { name, schema: VLEI_SCHEMAS[name] };
  }
  return undefined;
}

export function validateAttributes(
  name: VleiSchemaName,
  attrs: Record<string, unknown>,
): boolean {
  const spec = VLEI_SCHEMAS[name].attributes;

  return spec.required.every((key) => {
    const value = attrs[key];
    if (spec.types[key] === 'object') return typeof value === 'object' && value !== null;
    return typeof value === 'string' && value.length > 0;
  });
}

/** Official vLEI Ecosystem Governance Framework disclaimers, saidified. */
export const VLEI_RULES = saidify({
  d: '',
  usageDisclaimer: {
    l: 'Usage of a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, does not assert that the Legal Entity is trustworthy, honest, reputable in its business dealings, safe to do business with, or compliant with any laws.',
  },
  issuanceDisclaimer: {
    l: 'All information in a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, is accurate as of the date the validation process was complete.',
  },
}) as {
  readonly d: string;
  readonly usageDisclaimer: { readonly l: string };
  readonly issuanceDisclaimer: { readonly l: string };
};
