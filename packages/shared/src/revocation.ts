/**
 * Revocation, in two shapes.
 *
 * Single-credential revocation handles the ordinary case: a credential was
 * issued in error and is withdrawn.
 *
 * Subject revocation is the cascade. When a worker leaves the country, their
 * permit ends, or their wallet is lost, every fact about them stops being
 * presentable at once — nobody has to enumerate their credentials, and nothing
 * keeps working because it was overlooked. This is the mechanism that closes
 * the "departed worker's account is still open" gap.
 *
 * Deliberately in-memory: revocation state is a demo concern here, and there is
 * no persistence layer whose absence could be mistaken for a security property.
 */

export interface RevocationQuery {
  readonly credentialHash: string;
  readonly workerDID?: string | undefined;
}

export interface RevocationRegistry {
  revokeCredential(credentialHash: string): void;
  /** Cascade: revokes every credential naming this worker as its subject. */
  revokeSubject(workerDID: string): void;
  isRevoked(query: RevocationQuery): boolean;
  readonly revokedSubjects: readonly string[];
}

export function createRevocationRegistry(): RevocationRegistry {
  const credentials = new Set<string>();
  const subjects = new Set<string>();

  return {
    revokeCredential(hash) {
      credentials.add(hash);
    },
    revokeSubject(workerDID) {
      subjects.add(workerDID);
    },
    isRevoked(query) {
      if (credentials.has(query.credentialHash)) return true;

      return query.workerDID !== undefined && subjects.has(query.workerDID);
    },
    get revokedSubjects() {
      return [...subjects];
    },
  };
}
