import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { groth16 } from 'snarkjs';
import { poseidonCommit, presentCredential, verifyPresentation } from '@eas/shared';
import { createIssuer } from '@eas/issuer';
import { DEFAULT_RECONCILIATION_PARAMS, reconcile } from '@eas/reconciliation';

const BUILD = fileURLToPath(new URL('../../../circuits/build/', import.meta.url));
const wasm = join(BUILD, 'reconciliation_js', 'reconciliation.wasm');
const zkey = join(BUILD, 'reconciliation.zkey');
const built = existsSync(wasm) && existsSync(zkey);

/** The verdict codes the circuit emits, in the circuit's own numbering. */
const VERDICT = ['CONSISTENT', 'DISCREPANCY_UNDERPAID', 'DISCREPANCY_OVERPAID'] as const;

async function proveVerdict(totalHours: number, overtimeHours: number, deposit: number) {
  const hoursSalt = 111n;
  const salarySalt = 222n;
  const input = {
    totalHours,
    overtimeHours,
    hoursSalt: hoursSalt.toString(),
    deposit,
    salarySalt: salarySalt.toString(),
    hoursCommitment: await poseidonCommit([BigInt(totalHours), BigInt(overtimeHours), hoursSalt]),
    salaryCommitment: await poseidonCommit([BigInt(deposit), salarySalt]),
    legalWageRate: DEFAULT_RECONCILIATION_PARAMS.legalWageRate,
    overtimeMultiplierBps: Math.round(DEFAULT_RECONCILIATION_PARAMS.overtimeMultiplier * 10000),
    toleranceBps: DEFAULT_RECONCILIATION_PARAMS.toleranceBps,
  };

  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);
  const vkey: unknown = JSON.parse(readFileSync(join(BUILD, 'verification_key.json'), 'utf8'));

  return { proof, publicSignals, vkey, verdict: VERDICT[Number(publicSignals[0])] };
}

describe.skipIf(!built)('the circuit agrees with reconcile() and cannot be faked', () => {
  // Boundary cases matter most: a rounding difference between the floating
  // point reference and the scaled integer circuit would surface here first.
  //
  // Written out one by one rather than generated from a table: the repository's
  // documents state a test count that is checked by a static scan, and a loop
  // that produces five tests from one `test(` call would make that count wrong.
  test(
    '186h/42ot/38000TWD matches the reference',
    async () => {
      const expected = reconcile(
        { totalHours: 186, overtimeHours: 42 },
        { depositedAmountTWD: 38000 },
        DEFAULT_RECONCILIATION_PARAMS,
      );
      const { verdict, proof, publicSignals, vkey } = await proveVerdict(186, 42, 38000);

      expect(verdict).toBe(expected.code);
      expect(await groth16.verify(vkey, publicSignals, proof)).toBe(true);
    },
    60_000,
  );

  test(
    '150h/10ot/38000TWD matches the reference',
    async () => {
      const expected = reconcile(
        { totalHours: 150, overtimeHours: 10 },
        { depositedAmountTWD: 38000 },
        DEFAULT_RECONCILIATION_PARAMS,
      );
      const { verdict, proof, publicSignals, vkey } = await proveVerdict(150, 10, 38000);

      expect(verdict).toBe(expected.code);
      expect(await groth16.verify(vkey, publicSignals, proof)).toBe(true);
    },
    60_000,
  );

  test(
    '186h/42ot/1000TWD matches the reference',
    async () => {
      const expected = reconcile(
        { totalHours: 186, overtimeHours: 42 },
        { depositedAmountTWD: 1000 },
        DEFAULT_RECONCILIATION_PARAMS,
      );
      const { verdict, proof, publicSignals, vkey } = await proveVerdict(186, 42, 1000);

      expect(verdict).toBe(expected.code);
      expect(await groth16.verify(vkey, publicSignals, proof)).toBe(true);
    },
    60_000,
  );

  test(
    '200h/0ot/38000TWD matches the reference',
    async () => {
      const expected = reconcile(
        { totalHours: 200, overtimeHours: 0 },
        { depositedAmountTWD: 38000 },
        DEFAULT_RECONCILIATION_PARAMS,
      );
      const { verdict, proof, publicSignals, vkey } = await proveVerdict(200, 0, 38000);

      expect(verdict).toBe(expected.code);
      expect(await groth16.verify(vkey, publicSignals, proof)).toBe(true);
    },
    60_000,
  );

  test(
    '100h/100ot/25460TWD matches the reference',
    async () => {
      const expected = reconcile(
        { totalHours: 100, overtimeHours: 100 },
        { depositedAmountTWD: 25460 },
        DEFAULT_RECONCILIATION_PARAMS,
      );
      const { verdict, proof, publicSignals, vkey } = await proveVerdict(100, 100, 25460);

      expect(verdict).toBe(expected.code);
      expect(await groth16.verify(vkey, publicSignals, proof)).toBe(true);
    },
    60_000,
  );

  test(
    'a proof does not verify against altered public signals',
    async () => {
      const { proof, publicSignals, vkey } = await proveVerdict(186, 42, 38000);
      const tampered = [...publicSignals];
      tampered[1] = '1';

      expect(await groth16.verify(vkey, tampered, proof)).toBe(false);
    },
    60_000,
  );

  test(
    'the figures are not among the public signals',
    async () => {
      const { publicSignals } = await proveVerdict(186, 42, 38000);

      // Exactly: verdict, the two commitments, and the three public parameters.
      expect(publicSignals).toHaveLength(6);
      expect(publicSignals).not.toContain('186');
      expect(publicSignals).not.toContain('42');
      expect(publicSignals).not.toContain('38000');

      // Deliberately NOT a substring check over the serialized proof: field
      // elements are 77-digit numbers, so "186" appears inside them by chance
      // and such a test would fail at random. The guarantee is that no private
      // figure is a public output, which is what is asserted above.
    },
    60_000,
  );

  test(
    'a credential issued by the real issuer proves against the real circuit',
    async () => {
      // The path the browser takes: issue, open the worker's own credential to
      // read the figures and the salt, prove. If the issuer's commitment and
      // the circuit's Poseidon ever disagree, this is where it shows.
      const factory = await createIssuer('did:web:factory.example');
      const bank = await createIssuer('did:web:bank.example');

      const hoursCred = await factory.issue('WorkingHoursCredential', {
        workerDID: 'did:key:zWorker001',
        withinRBALimit: true,
        periodStart: '2026-08-01',
        totalHours: 186,
        overtimeHours: 42,
      });
      const salaryCred = await bank.issue('SalaryDepositCredential', {
        workerDID: 'did:key:zWorker001',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        issuerType: 'BANK',
        depositedAmountTWD: 38000,
        depositCount: 1,
      });

      const hoursOpen = await verifyPresentation(
        await presentCredential(hoursCred, ['totalHours', 'overtimeHours', 'commitmentSalt']),
        factory.publicKey,
      );
      const salaryOpen = await verifyPresentation(
        await presentCredential(salaryCred, ['depositedAmountTWD', 'commitmentSalt']),
        bank.publicKey,
      );

      const { proof, publicSignals } = await groth16.fullProve(
        {
          totalHours: Number(hoursOpen.payload['totalHours']),
          overtimeHours: Number(hoursOpen.payload['overtimeHours']),
          hoursSalt: String(hoursOpen.payload['commitmentSalt']),
          deposit: Number(salaryOpen.payload['depositedAmountTWD']),
          salarySalt: String(salaryOpen.payload['commitmentSalt']),
          hoursCommitment: String(hoursOpen.payload['valueCommitment']),
          salaryCommitment: String(salaryOpen.payload['valueCommitment']),
          legalWageRate: DEFAULT_RECONCILIATION_PARAMS.legalWageRate,
          overtimeMultiplierBps: Math.round(
            DEFAULT_RECONCILIATION_PARAMS.overtimeMultiplier * 10000,
          ),
          toleranceBps: DEFAULT_RECONCILIATION_PARAMS.toleranceBps,
        },
        wasm,
        zkey,
      );
      const vkey: unknown = JSON.parse(readFileSync(join(BUILD, 'verification_key.json'), 'utf8'));

      expect(VERDICT[Number(publicSignals[0])]).toBe('CONSISTENT');
      expect(await groth16.verify(vkey, publicSignals, proof)).toBe(true);
    },
    60_000,
  );
});
