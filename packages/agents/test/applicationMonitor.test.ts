import { describe, expect, test } from 'vitest';
import {
  DEFAULT_APPLICATION_WINDOW_DAYS,
  classifyRbaItem,
  createApplicationMonitor,
  createBankAgent,
} from '@eas/agents';

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
        zeroRecruitmentFeePaid: true,
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

    expect(agent.assess({ zeroRecruitmentFeePaid: true }).riskFlags).toEqual([]);
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

describe('the frequency signal is a burst detector, not a life history (題05 Q3)', () => {
  const WORKER = 'did:key:zWorker001';
  const day = (n: number) => new Date(Date.UTC(2026, 7, n));

  test('four applications inside the window trip the flag', () => {
    const monitor = createApplicationMonitor();
    for (const d of [1, 2, 3, 4]) monitor.record(WORKER, day(d));

    const risk = monitor.risk(WORKER, day(5));

    expect(risk.count).toBe(4);
    expect(risk.flagged).toBe(true);
  });

  test('the same four applications spread across months do not', () => {
    // A worker who legitimately changes employer several times must not carry
    // a fraud flag for it. A signal everyone eventually trips is one reviewers
    // learn to ignore, which is worse than no signal at all.
    const monitor = createApplicationMonitor();
    for (const d of [1, 20, 40, 60]) monitor.record(WORKER, day(d));

    const risk = monitor.risk(WORKER, day(61));

    expect(risk.count).toBe(1);
    expect(risk.flagged).toBe(false);
  });

  test('an application exactly at the window edge still counts', () => {
    const monitor = createApplicationMonitor({ threshold: 0 });
    monitor.record(WORKER, day(1));

    const edge = new Date(day(1).getTime() + DEFAULT_APPLICATION_WINDOW_DAYS * 86_400_000);

    expect(monitor.risk(WORKER, edge).count).toBe(1);
  });

  test('one worker’s applications never appear in another’s count', () => {
    const monitor = createApplicationMonitor();
    for (const d of [1, 2, 3, 4]) monitor.record('did:key:zWorker002', day(d));

    expect(monitor.risk(WORKER, day(5)).flagged).toBe(false);
  });

  test('there is no way to record or read which institution was applied to', () => {
    // The privacy property is structural: `record` has no parameter for it, so
    // a verifier cannot learn where else someone applied even by accident.
    const monitor = createApplicationMonitor();
    monitor.record(WORKER, day(1));

    expect(monitor.record.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(monitor.risk(WORKER, day(2)))).not.toContain('bank');
    expect(Object.keys(monitor.risk(WORKER, day(2))).sort()).toEqual(['count', 'flagged']);
  });

  test('a flagged worker still gets a recommendation, and it is never final', () => {
    // The flag informs; it does not decide. A fully compliant applicant who
    // trips the frequency signal is still recommended for approval, with the
    // flag attached for the human to weigh.
    const monitor = createApplicationMonitor();
    for (const d of [1, 2, 3, 4]) monitor.record(WORKER, day(d));

    const assessment = createBankAgent().assess(
      {
        zeroRecruitmentFeePaid: true,
        passportHeldByWorker: true,
        nativeLanguageVersionProvided: true,
      },
      { flagged: monitor.risk(WORKER, day(5)).flagged },
    );

    expect(assessment.riskFlags).toEqual(['MULTIPLE_APPLICATIONS']);
    expect(assessment.recommendation).toBe('APPROVE_PENDING_HUMAN_REVIEW');
    expect(assessment.requiresHumanReview).toBe(true);
  });
});
