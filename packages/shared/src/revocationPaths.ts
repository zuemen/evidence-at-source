/**
 * The three revocation paths, named.
 *
 * The primitives already exist (a RevocationRegistry can revoke a credential
 * hash or a subject). What was implicit is that revocation arrives from three
 * different principals, enforced at two different gate layers. This directory
 * makes each path first-class:
 *
 *   Path A — 簽發方撤銷:  an issuer withdraws one credential it issued in error.
 *   Path B — 主體連動撤銷: a worker's departure/lost device revokes all of theirs.
 *   Path C — 機構撤銷 Agent: an institution revokes an agent's delegation.
 *
 * Paths A and B are enforced at L1 (credentialRevocations); Path C at L0
 * (delegationRevocations). The two registries are separate, so revoking an agent
 * can never touch a worker's credentials, and vice versa.
 */

import { createRevocationRegistry, type RevocationRegistry } from './revocation.js';

export type RevocationPath = 'issuer-credential' | 'subject-cascade' | 'institution-agent';

export interface RevocationDirectory {
  /** Path A: withdraw a single credential by its hash (enforced at L1). */
  revokeCredential(credentialHash: string): void;
  /** Path B: cascade over every credential naming this worker (enforced at L1). */
  revokeWorker(workerDID: string): void;
  /** Path C: revoke an agent's delegation (enforced at L0). */
  revokeAgent(agentDid: string): void;
  /** Pass to the credential layer (L1) as its `revocations`. */
  readonly credentialRevocations: RevocationRegistry;
  /** Pass to the agent-delegation layer (L0) as its `revocations`. */
  readonly delegationRevocations: RevocationRegistry;
}

export function createRevocationDirectory(): RevocationDirectory {
  const credentialRevocations = createRevocationRegistry();
  const delegationRevocations = createRevocationRegistry();

  return {
    credentialRevocations,
    delegationRevocations,
    revokeCredential(hash) {
      credentialRevocations.revokeCredential(hash);
    },
    revokeWorker(workerDID) {
      credentialRevocations.revokeSubject(workerDID);
    },
    revokeAgent(agentDid) {
      delegationRevocations.revokeSubject(agentDid);
    },
  };
}
