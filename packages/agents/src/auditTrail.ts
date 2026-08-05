/**
 * Unified audit trail — the six-point framework's "Audit Log" answer.
 *
 * Every gate decision is recorded with its layer, verdict, reason code and
 * authorization basis (delegation credential hash + ECR credential SAID), so
 * "on whose authority did the agent act, and what did the gate decide" is a
 * queryable record rather than a log-file archaeology. Entries carry reason
 * codes only — never a worker field value.
 */

import type { ReasonCode } from '@eas/shared';

export interface AuditBasis {
  readonly delegationHash: string | null;
  readonly ecrSaid: string | null;
}

export interface AuditEntry {
  readonly seq: number;
  readonly at: string;
  readonly agentRole: string;
  readonly layer: 'L0' | 'L1' | 'L2';
  readonly action: string;
  readonly decision: 'ALLOW' | 'DENY';
  readonly reason: ReasonCode | null;
  readonly basis: AuditBasis;
}

export interface AuditTrail {
  record(entry: Omit<AuditEntry, 'seq' | 'at'>): AuditEntry;
  entries(): readonly AuditEntry[];
}

export function createAuditTrail(): AuditTrail {
  const log: AuditEntry[] = [];

  return {
    record(entry) {
      const full: AuditEntry = { ...entry, seq: log.length + 1, at: new Date().toISOString() };
      log.push(full);
      return full;
    },
    entries: () => log,
  };
}
