/**
 * 我方實作是否符合我方公布的規格。
 *
 * 這與 repo 裡其他測試的差別值得寫下來：其餘測試是「我們檢查我們想檢查的」，
 * 這一個是「我們檢查我們是否符合自己公布給別人看的那份東西」。
 *
 * 向量是靜態的公開值。任何人都能拿同一組檔案去驗自己的實作——這正是它們存在的理由，
 * 也是「一份規格」與「一篇文章」的分界。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeJwt, importJWK, jwtVerify, type JWK } from 'jose';
import { describe, expect, test } from 'vitest';
import { credentialHash, verifyPairing, type ReasonCode } from '@eas/shared';

const DIR = fileURLToPath(new URL('../../../spec/vectors/', import.meta.url));

interface Vector {
  readonly id: string;
  readonly description: string;
  readonly rationale: string;
  readonly input: {
    readonly issuerCredential: string;
    readonly workerAttestation: string;
    readonly issuerPublicJwk: JWK;
    readonly workerPublicJwk: JWK;
  };
  readonly expected: {
    readonly pairingValid: boolean;
    readonly reasonCode: ReasonCode | null;
    readonly credentialExpired?: boolean;
  };
}

function loadVectors(): Vector[] {
  return readdirSync(DIR)
    .filter((name) => name.startsWith('dsp-') && name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(DIR + name, 'utf8')) as Vector);
}

/** Reads the credential's subject without trusting it — used only to compare. */
function subjectOf(credential: string): string {
  return String(decodeJwt(credential.split('~')[0] ?? '')['workerDID']);
}

/** Spec §6 steps 3-5, which is what the vectors describe. */
async function evaluate(vector: Vector): Promise<{
  pairingValid: boolean;
  reasonCode: ReasonCode | null;
}> {
  const pairing = await verifyPairing(
    vector.input.workerAttestation,
    vector.input.issuerCredential,
    vector.input.workerPublicJwk as never,
  );
  if (!pairing.ok) return { pairingValid: false, reasonCode: pairing.reason };

  // Step 5. It lives in the credential layer in this implementation because
  // that is where the credential payload is parsed; at the spec's level of
  // abstraction it is simply the next check.
  if (pairing.workerDID !== subjectOf(vector.input.issuerCredential)) {
    return { pairingValid: false, reasonCode: 'ATTESTATION_SUBJECT_MISMATCH' };
  }

  return { pairingValid: true, reasonCode: null };
}

const vectors = loadVectors();

describe('我方實作符合 spec/vectors', () => {
  test('the vector set is present and covers the published scenarios', () => {
    // A conformance suite that silently found no files would pass forever.
    expect(vectors.length).toBeGreaterThanOrEqual(8);
    expect(vectors.map((v) => v.id)).toContain('dsp-005');
  });

  test('dsp-001 誠實流程', async () => {
    await expectVector('dsp-001');
  });

  test('dsp-002 簽發者事後篡改', async () => {
    await expectVector('dsp-002');
  });

  test('dsp-003 缺少勞工反簽', async () => {
    await expectVector('dsp-003');
  });

  test('dsp-004 勞工簽章無效', async () => {
    await expectVector('dsp-004');
  });

  test('dsp-005 選擇性揭露後配對仍成立', async () => {
    // The one that separates a correct hash scope from an incorrect one.
    await expectVector('dsp-005');
  });

  test('dsp-006 憑證已過期，但配對本身仍成立', async () => {
    await expectVector('dsp-006');
  });

  test('dsp-007 反簽指向另一張憑證', async () => {
    await expectVector('dsp-007');
  });

  test('dsp-008 他人替當事人反簽', async () => {
    await expectVector('dsp-008');
  });

  test('dsp-009 型別錯誤的 JWT 冒充反簽', async () => {
    await expectVector('dsp-009');
  });
});

async function expectVector(id: string): Promise<void> {
  const vector = vectors.find((v) => v.id === id);
  expect(vector, `${id} is missing from spec/vectors`).toBeDefined();
  if (vector === undefined) return;

  const actual = await evaluate(vector);

  expect(actual.pairingValid, `${id}: ${vector.description}`).toBe(vector.expected.pairingValid);
  expect(actual.reasonCode, `${id}: ${vector.description}`).toBe(vector.expected.reasonCode);
}

describe('向量本身是自洽的', () => {
  test('every issuer credential verifies against the published issuer key', async () => {
    // If a vector's credential did not verify against its own published key,
    // the whole file would be describing something nobody can reproduce.
    for (const vector of vectors) {
      const segment = vector.input.issuerCredential.split('~')[0] ?? '';
      const key = await importJWK(vector.input.issuerPublicJwk, 'ES256');
      if (vector.expected.credentialExpired === true) {
        await expect(jwtVerify(segment, key)).rejects.toThrow();
        continue;
      }
      await expect(jwtVerify(segment, key)).resolves.toBeDefined();
    }
  });

  test('the selective-disclosure vector really is a shortened presentation', async () => {
    // dsp-005 proves nothing if it happens to be the full credential.
    const full = vectors.find((v) => v.id === 'dsp-001')!.input.issuerCredential;
    const presented = vectors.find((v) => v.id === 'dsp-005')!.input.issuerCredential;

    expect(presented.length).toBeLessThan(full.length);
    // And the part that is hashed is identical, which is the whole design.
    expect(credentialHash(presented)).toBe(credentialHash(full));
  });
});
