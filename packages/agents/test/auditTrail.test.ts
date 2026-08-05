import { describe, expect, test } from 'vitest';
import { createAuditTrail } from '@eas/agents';

describe('audit trail (six-point framework: Audit Log)', () => {
  test('records decisions in order with seq and timestamp', () => {
    const trail = createAuditTrail();

    const first = trail.record({
      agentRole: 'bank',
      layer: 'L0',
      action: 'boolean:DocumentCustodyCredential',
      decision: 'ALLOW',
      reason: null,
      basis: { delegationHash: 'sha256:abc', ecrSaid: 'E' + 'A'.repeat(43) },
    });
    trail.record({
      agentRole: 'brand',
      layer: 'L2',
      action: 'individual:zWorker001',
      decision: 'DENY',
      reason: 'INDIVIDUAL_QUERY_REJECTED',
      basis: { delegationHash: 'sha256:def', ecrSaid: null },
    });

    const entries = trail.entries();
    expect(first.seq).toBe(1);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.seq).toBe(2);
    expect(entries[1]?.decision).toBe('DENY');
    expect(typeof entries[0]?.at).toBe('string');
  });

  test('a deny entry never carries worker field values, only reason codes', () => {
    const trail = createAuditTrail();
    trail.record({
      agentRole: 'brand',
      layer: 'L2',
      action: 'aggregate:workingHoursComplianceRate',
      decision: 'DENY',
      reason: 'AGGREGATE_BELOW_K_ANONYMITY',
      basis: { delegationHash: null, ecrSaid: null },
    });

    const serialised = JSON.stringify(trail.entries());
    expect(serialised).not.toContain('totalHours');
    expect(serialised).not.toContain('186');
  });
});
