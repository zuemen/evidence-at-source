export { buildMerkleTree, getInclusionProof, verifyInclusionProof } from './merkle.js';
export type { InclusionProof, MerkleTree, ProofStep } from './merkle.js';

export {
  COMMITMENT_TYP,
  createRecordSetCommitment,
  detectOmission,
  signCommitment,
  verifyCommitment,
} from './commitment.js';
export type {
  CommitmentMeta,
  OmissionInput,
  RecordSetCommitment,
} from './commitment.js';
