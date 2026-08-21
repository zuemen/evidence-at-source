/**
 * Runs a directory of conformance vectors against this verifier.
 *
 * This is the entry point for someone checking their own implementation: the
 * vectors are public and static, and nothing here touches the reference
 * runtime. A judge can watch this pass without extending any trust to the
 * package it is nominally verifying.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { verifyPairing } from './pairing.js';

export async function runVectors(directory) {
  const files = readdirSync(directory)
    .filter((name) => name.startsWith('dsp-') && name.endsWith('.json'))
    .sort();

  const results = [];

  for (const file of files) {
    const vector = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    const outcome = await verifyPairing({
      credential: vector.input.issuerCredential,
      attestation: vector.input.workerAttestation,
      workerPublicJwk: vector.input.workerPublicJwk,
    });

    const actual = {
      pairingValid: outcome.ok,
      reasonCode: outcome.ok ? null : outcome.reason,
    };
    const passed =
      actual.pairingValid === vector.expected.pairingValid &&
      actual.reasonCode === (vector.expected.reasonCode ?? null);

    results.push({ id: vector.id, description: vector.description, passed, actual, expected: vector.expected });
  }

  return results;
}
