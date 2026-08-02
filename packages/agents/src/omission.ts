/**
 * Turns a set of held records and a published commitment into a cohort of
 * omission signals. Like buildCohortEvidence, this is where identity stops: each
 * entry arrives with a worker's record hash and proof, and what comes out is a
 * bare list of booleans the agent can count but not attribute.
 */

import { detectOmission, type InclusionProof, type RecordSetCommitment } from '@eas/integrity';
import type { OmissionCohort } from './brandAgent.js';

export interface HeldRecord {
  readonly recordHash: string;
  /** The inclusion proof the factory could produce for this record, or null. */
  readonly inclusionProof: InclusionProof | null;
}

export interface OmissionCohortRequest {
  readonly cohort: string;
  readonly window: string;
  readonly commitment: RecordSetCommitment;
  readonly heldRecords: readonly HeldRecord[];
}

export function buildOmissionCohort(request: OmissionCohortRequest): OmissionCohort {
  const signals = request.heldRecords.map((held) =>
    detectOmission({
      heldRecordHash: held.recordHash,
      commitment: request.commitment,
      inclusionProof: held.inclusionProof,
    }),
  );

  return { cohort: request.cohort, window: request.window, signals };
}
