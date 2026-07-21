export { CREDENTIAL_TYPES, getCredentialSchema } from './credentials.js';
export type { CredentialType, DisclosureSchema } from './credentials.js';

export {
  generateKeyPair,
  presentCredential,
  signCredential,
  verifyPresentation,
} from './sdjwt.js';
export type { CredentialPayload, PrivateJwk, PublicJwk, VerifiedCredential } from './sdjwt.js';

export { createRevocationRegistry } from './revocation.js';
export type { RevocationQuery, RevocationRegistry } from './revocation.js';

export { REASON_CODES } from './reasonCodes.js';
export type { ReasonCode } from './reasonCodes.js';

export {
  ATTESTATION_TYP,
  createWorkerAttestation,
  credentialHash,
  verifyPairing,
} from './attestation.js';
export type { AttestationInput, PairingResult } from './attestation.js';
