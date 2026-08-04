export { CREDENTIAL_TYPES, getCredentialSchema } from './credentials.js';
export type { CredentialType, DisclosureSchema } from './credentials.js';

export {
  base64urlToUtf8,
  bytesToBase64url,
  hexToBytes,
  sha256Base64url,
  sha256Hex,
  utf8ToBytes,
} from './hash.js';

export {
  generateKeyPair,
  presentCredential,
  signCredential,
  verifyPresentation,
} from './sdjwt.js';
export type { CredentialPayload, PrivateJwk, PublicJwk, VerifiedCredential } from './sdjwt.js';

export { createRevocationRegistry } from './revocation.js';
export type { RevocationQuery, RevocationRegistry } from './revocation.js';

export { createRevocationDirectory } from './revocationPaths.js';
export type { RevocationDirectory, RevocationPath } from './revocationPaths.js';

export { REASON_CODES } from './reasonCodes.js';
export type { ReasonCode } from './reasonCodes.js';

export {
  DEFAULT_DELEGATION_LIFETIME_SECONDS,
  DELEGATION_VCT,
} from './delegation.js';
export type { AllowedQueryType, DelegationClaims } from './delegation.js';

export {
  ATTESTATION_TYP,
  createWorkerAttestation,
  credentialHash,
  verifyPairing,
} from './attestation.js';
export type { AttestationInput, PairingResult } from './attestation.js';
