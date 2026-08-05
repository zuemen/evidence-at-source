import { describe, expect, test } from 'vitest';
import { classifyRbaItem, createApplicationMonitor, createBankAgent } from '@eas/agents';

describe('cross-institution application monitor (題05 Q3)', () => {
  test('flags a worker DID that applies more often than the threshold', () => {
    const monitor = createApplicationMonitor({ threshold: 3 });
    const did = 'did:key:zWorker001';

    monitor.record(did);
    monitor.record(did);
    expect(monitor.risk(did).flagged).toBe(false);

    monitor.record(did);
    monitor.record(did);
    const risk = monitor.risk(did);

    expect(risk.count).toBe(4);
    expect(risk.flagged).toBe(true);
  });

  test('one worker crossing the threshold does not flag another', () => {
    const monitor = createApplicationMonitor({ threshold: 1 });
    monitor.record('did:key:zWorker001');
    monitor.record('did:key:zWorker001');

    expect(monitor.risk('did:key:zWorker001').flagged).toBe(true);
    expect(monitor.risk('did:key:zWorker002').flagged).toBe(false);
  });

  test('the risk answer carries a count and a flag, nothing about where', () => {
    const monitor = createApplicationMonitor();
    monitor.record('did:key:zWorker001');

    expect(Object.keys(monitor.risk('did:key:zWorker001')).sort()).toEqual(['count', 'flagged']);
  });

  test('the bank assessment surfaces the risk but stays advisory', () => {
    const agent = createBankAgent();

    const assessment = agent.assess(
      {
        feeWithinLegalCap: true,
        passportHeldByWorker: true,
        nativeLanguageVersionProvided: true,
      },
      { flagged: true },
    );

    expect(assessment.riskFlags).toContain('MULTIPLE_APPLICATIONS');
    expect(assessment.requiresHumanReview).toBe(true);
  });

  test('no risk signal means no flags, and the agent still exposes only assess', () => {
    const agent = createBankAgent();

    expect(agent.assess({ feeWithinLegalCap: true }).riskFlags).toEqual([]);
    expect(Object.keys(agent)).toEqual(['assess']);
  });
});

describe('RBA item classification (題06 Q3)', () => {
  test('working hours and document custody are credential-answerable', () => {
    expect(classifyRbaItem('workingHoursWithinLimit')).toBe('CREDENTIAL_ANSWERABLE');
    expect(classifyRbaItem('passportHeldByWorker')).toBe('CREDENTIAL_ANSWERABLE');
  });

  test('physical conditions require an on-site audit', () => {
    expect(classifyRbaItem('fireSafetyConditions')).toBe('REQUIRES_ON_SITE');
    expect(classifyRbaItem('dormitoryLivingConditions')).toBe('REQUIRES_ON_SITE');
  });

  test('an unknown item is UNKNOWN, never silently answerable', () => {
    expect(classifyRbaItem('somethingNew')).toBe('UNKNOWN');
  });
});
