import { describe, expect, test } from 'vitest';
import { createIssuer } from '@eas/issuer';
import { presentCredential, verifyPresentation } from '@eas/shared';
import {
  adaptSourceEvent,
  claimsWithinSchema,
  type AdapterConfig,
  type SourceEvent,
} from '@eas/adapters';

const CONFIG: AdapterConfig = {
  facilityId: 'gs1:facility-a',
  workerDirectory: { 'EMP-0417': 'did:key:zWorker001' },
  rbaMonthlyHourLimit: 208,
  recruitmentFeeLegalCap: 60000,
};

function clockEvent(fields: Record<string, unknown>): SourceEvent {
  return {
    source: 'factory-clock',
    facilityId: 'gs1:facility-a',
    workerRef: 'EMP-0417',
    occurredAt: '2026-09-01T00:00:00Z',
    fields,
  };
}

const PERIOD = { totalHours: 186, overtimeHours: 42, periodStart: '2026-08-01' };

describe('source adapters map events into claims, and refuse everything else', () => {
  test('a closed pay period becomes claims an issuer can sign', () => {
    const outcome = adaptSourceEvent(clockEvent(PERIOD), CONFIG);

    expect(outcome).toEqual({
      kind: 'ISSUE',
      type: 'WorkingHoursCredential',
      claims: {
        workerDID: 'did:key:zWorker001',
        withinRBALimit: true,
        periodStart: '2026-08-01',
        totalHours: 186,
        overtimeHours: 42,
      },
    });
  });

  test('the hour ceiling is configuration, so a stricter buyer gets a different verdict', () => {
    const strict = adaptSourceEvent(clockEvent(PERIOD), { ...CONFIG, rbaMonthlyHourLimit: 180 });

    expect(strict).toMatchObject({ kind: 'ISSUE', claims: { withinRBALimit: false } });
  });

  test('the raw figures survive the mapping but never reach a verifier', async () => {
    const outcome = adaptSourceEvent(clockEvent(PERIOD), CONFIG);
    if (outcome.kind !== 'ISSUE') throw new Error('expected an issuable outcome');

    const issuer = await createIssuer('did:web:factory.example');
    const credential = await issuer.issue(outcome.type, outcome.claims);
    const verified = await verifyPresentation(
      await presentCredential(credential, ['withinRBALimit']),
      issuer.publicKey,
    );

    expect(verified.payload['withinRBALimit']).toBe(true);
    expect('totalHours' in verified.payload).toBe(false);
    expect('overtimeHours' in verified.payload).toBe(false);
  });

  test('an incomplete event yields nothing at all, rather than a partial credential', () => {
    const outcome = adaptSourceEvent(clockEvent({ totalHours: 186, periodStart: '2026-08-01' }), CONFIG);

    expect(outcome).toEqual({ kind: 'REJECTED', reason: 'SOURCE_FIELD_MISSING' });
  });

  test('a worker the directory does not know is refused, not guessed at', () => {
    const outcome = adaptSourceEvent({ ...clockEvent(PERIOD), workerRef: 'EMP-9999' }, CONFIG);

    expect(outcome).toEqual({ kind: 'REJECTED', reason: 'WORKER_REF_UNMAPPED' });
  });

  test('an event from another facility is refused even when the worker is known', () => {
    const outcome = adaptSourceEvent(
      { ...clockEvent(PERIOD), facilityId: 'gs1:facility-b' },
      CONFIG,
    );

    expect(outcome).toEqual({ kind: 'REJECTED', reason: 'SOURCE_FACILITY_MISMATCH' });
  });

  test('a field the schema has never heard of is refused, because it would be published', () => {
    // Anything not listed as hidden is public in the issued credential. A new
    // adapter that innocently passes a source field through would therefore
    // publish it; this guard is what makes that a rejection instead.
    const verdict = claimsWithinSchema('WorkingHoursCredential', {
      workerDID: 'did:key:zWorker001',
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
      supervisorNote: 'argued about overtime again',
    });

    expect(verdict).toBe('SOURCE_FIELD_NOT_IN_SCHEMA');
  });

  test('an adapter may not supply the commitment fields the issuer owns', () => {
    const verdict = claimsWithinSchema('WorkingHoursCredential', {
      workerDID: 'did:key:zWorker001',
      withinRBALimit: true,
      periodStart: '2026-08-01',
      totalHours: 186,
      overtimeHours: 42,
      valueCommitment: '12345',
    });

    expect(verdict).toBe('SOURCE_FIELD_NOT_IN_SCHEMA');
  });

  test('a billed recruitment fee becomes a credential whose amount is hidden', async () => {
    const outcome = adaptSourceEvent(
      {
        source: 'agency-billing',
        facilityId: 'gs1:facility-a',
        workerRef: 'EMP-0417',
        occurredAt: '2026-07-15T09:00:00Z',
        fields: {
          feeAmount: 48000,
          currency: 'TWD',
          contractPeriod: '2026-08-01/2029-07-31',
          paymentSchedule: '12 monthly instalments',
          lenderName: 'Synthetic Lender Co.',
        },
      },
      CONFIG,
    );
    if (outcome.kind !== 'ISSUE') throw new Error('expected an issuable outcome');

    expect(outcome.claims['feeWithinLegalCap']).toBe(true);

    const issuer = await createIssuer('did:web:agency.example');
    const credential = await issuer.issue(outcome.type, outcome.claims);
    const verified = await verifyPresentation(
      await presentCredential(credential, ['feeWithinLegalCap']),
      issuer.publicKey,
    );

    expect('feeAmount' in verified.payload).toBe(false);
  });

  test('departure revokes rather than issuing, and an ordinary status change does nothing', () => {
    const departure = adaptSourceEvent(
      {
        source: 'immigration-status',
        facilityId: 'gs1:facility-a',
        workerRef: 'EMP-0417',
        occurredAt: '2026-12-01T00:00:00Z',
        fields: { status: 'DEPARTED' },
      },
      CONFIG,
    );
    const unchanged = adaptSourceEvent(
      {
        source: 'immigration-status',
        facilityId: 'gs1:facility-a',
        workerRef: 'EMP-0417',
        occurredAt: '2026-09-01T00:00:00Z',
        fields: { status: 'ACTIVE' },
      },
      CONFIG,
    );

    expect(departure).toEqual({
      kind: 'REVOKE_SUBJECT',
      workerDID: 'did:key:zWorker001',
      reason: 'DEPARTED',
    });
    expect(unchanged).toEqual({ kind: 'NO_ACTION' });
  });

  test('the same event always maps to the same claims, because nothing is fetched', () => {
    // Purity is the whole point of the boundary: an adapter that could query
    // would let the source decide what to hand over and when, which is the
    // failure this project exists to remove.
    const first = adaptSourceEvent(clockEvent(PERIOD), CONFIG);
    const second = adaptSourceEvent(clockEvent(PERIOD), CONFIG);

    expect(first).toEqual(second);
  });
});
