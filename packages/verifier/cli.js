#!/usr/bin/env node
/**
 * Independent verifier CLI.
 *
 * Three commands, all of them checks. There is no issue command and there will
 * not be one: a verifier that could mint credentials would have a trust surface
 * the size of the system it is supposed to audit from outside.
 */

import { readFileSync } from 'node:fs';
import { runVectors } from './src/vectors.js';
import { verifyIssuerCredential, verifyPairing } from './src/pairing.js';
import { verifyReceipt } from './src/receipt.js';

const [, , command, ...args] = process.argv;

/** Accepts a path or a literal value, so the CLI is usable either way. */
function read(value) {
  try {
    return readFileSync(value, 'utf8').trim();
  } catch {
    return value;
  }
}

function readJson(value) {
  return JSON.parse(read(value));
}

function usage() {
  console.error(`eas-verify — independent verifier (no @eas/* dependencies)

  eas-verify pairing <credential> <attestation> <issuer-jwk> <worker-jwk>
  eas-verify receipt <receipt> <verifier-jwk>
  eas-verify vectors <path-to-vectors>

Each argument may be a file path or the value itself.`);
}

async function main() {
  if (command === 'vectors') {
    const directory = args[0];
    if (directory === undefined) return usage(), 2;

    const results = await runVectors(directory);
    let failed = 0;

    for (const result of results) {
      if (result.passed) {
        console.log(`  PASS  ${result.id}  ${result.description}`);
      } else {
        failed += 1;
        console.log(`  FAIL  ${result.id}  ${result.description}`);
        console.log(`        expected ${JSON.stringify(result.expected)}`);
        console.log(`        actual   ${JSON.stringify(result.actual)}`);
      }
    }

    console.log(
      `\n${results.length - failed}/${results.length} vectors passed` +
        (results.length === 0 ? ' — no vectors found, which proves nothing' : ''),
    );

    // An empty run must not look like success.
    return failed === 0 && results.length > 0 ? 0 : 1;
  }

  if (command === 'pairing') {
    const [credential, attestation, issuerJwk, workerJwk] = args;
    if (workerJwk === undefined) return usage(), 2;

    const issuerCheck = await verifyIssuerCredential({
      credential: read(credential),
      issuerPublicJwk: readJson(issuerJwk),
    });
    if (!issuerCheck.ok) {
      console.log(`REFUSED  ${issuerCheck.reason}`);
      return 1;
    }

    const result = await verifyPairing({
      credential: read(credential),
      attestation: read(attestation),
      workerPublicJwk: readJson(workerJwk),
    });

    console.log(result.ok ? `PAIRED   ${result.workerDID}` : `REFUSED  ${result.reason}`);
    return result.ok ? 0 : 1;
  }

  if (command === 'receipt') {
    const [receipt, verifierJwk] = args;
    if (verifierJwk === undefined) return usage(), 2;

    const result = await verifyReceipt({
      receipt: read(receipt),
      verifierPublicJwk: readJson(verifierJwk),
    });

    console.log(result.ok ? `VALID    ${JSON.stringify(result, null, 2)}` : `REFUSED  ${result.reason}`);
    return result.ok ? 0 : 1;
  }

  usage();

  return 2;
}

process.exit(await main());
