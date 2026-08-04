export { MATTER_CODES, encodeMatter, decodeMatter } from './cesr.js';
export { SAID_DUMMY, saidify, verifySaid, versify } from './said.js';
export type { Ked } from './said.js';
export { KelStore, createAid, createKeyMaterial, verifyKel } from './kel.js';
export type { AidController, KelEvent, KeyMaterial, SignedKelEvent } from './kel.js';
export { computeLeiCheckDigits, isValidLei, syntheticLei } from './lei.js';
export { CredentialRegistry, TelStore } from './tel.js';
export type { CredentialStatus, SignedTelEvent, TelEvent } from './tel.js';
export {
  VLEI_RULES,
  VLEI_SCHEMAS,
  schemaBySaid,
  schemaSaid,
  validateAttributes,
} from './schemas.js';
export type { AttributeSpec, VleiSchema, VleiSchemaName } from './schemas.js';
