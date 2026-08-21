/**
 * SAID 互通性：與 GLEIF vLEI 參考沙盒逐位元組比對。
 *
 * `docs/vlei.md` 原本寫著 SAID 計算「未經官方測試向量驗證」。那是懂 KERI 的人第一個會問
 * 的問題，而它一直沒有答案——自己算的雜湊自己驗，永遠會通過。
 *
 * 現在有答案了。下面的向量是用 [smpebble/vlei-sandbox](https://github.com/smpebble/vlei-sandbox)
 * （MIT，純 Python 的 KERI／CESR／ACDC 參考實作）產生的，記錄在
 * `fixtures/vlei-sandbox-said-vectors.json`，包含它算出來的 SAID。
 *
 * **比對是在位元組層級成立的，不只是雜湊值相同。** 兩邊先產生完全相同的預映像位元組
 * （欄位順序、無空白、`ensure_ascii=False` 對應 `JSON.stringify` 的非 ASCII 不跳脫、
 * 版本字串的兩趟計算），才比雜湊——否則「湊巧相同」和「真的一致」分不出來。
 *
 * 沙盒是驗證工具，不是執行期相依：向量記錄下來，Python 不參與測試。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { saidify, versify, type Ked } from '@eas/vlei';

interface Vector {
  readonly proto: 'KERI' | 'ACDC';
  readonly labels: readonly string[];
  readonly input: Ked;
  /** The SAID the Python reference computed for exactly this content. */
  readonly said: string;
}

const VECTORS: Record<string, Vector> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../fixtures/vlei-sandbox-said-vectors.json', import.meta.url)),
    'utf8',
  ),
);

describe('與 vLEI 參考沙盒的 SAID 互通性', () => {
  test('the recorded vectors cover the shapes that would expose a drift', () => {
    // An ACDC with an edge block, a KERI inception where `d` and `i` carry the
    // same SAID, and a payload of nested objects, numbers and CJK. Each one
    // fails differently if a serialization detail diverges.
    expect(Object.keys(VECTORS).sort()).toEqual([
      'acdc_with_edges',
      'keri_icp_d_equals_i',
      'nested_and_numbers',
    ]);
  });

  for (const [name, vector] of Object.entries(VECTORS)) {
    test(`${name}: our SAID equals the reference implementation's`, () => {
      const input = { ...vector.input };
      if ('v' in input) input['v'] = versify(vector.proto, 0);

      const result = saidify(input, [...vector.labels]);

      expect(result[vector.labels[0] as string]).toBe(vector.said);
    });
  }

  test('every said label carries the same value, as KERI requires', () => {
    const icp = VECTORS['keri_icp_d_equals_i'] as Vector;
    const result = saidify({ ...icp.input, v: versify('KERI', 0) }, [...icp.labels]);

    // The inception case: the identifier prefix `i` *is* the event SAID.
    expect(result['i']).toBe(result['d']);
    expect(result['i']).toBe(icp.said);
  });

  test('a changed byte changes the SAID, so agreement is not vacuous', () => {
    // Without this the tests above would also pass against an implementation
    // that returned a constant.
    const vector = VECTORS['nested_and_numbers'] as Vector;
    const tampered = {
      ...vector.input,
      a: { ...(vector.input['a'] as Record<string, unknown>), n: 1 },
    };

    expect(saidify(tampered, ['d'])['d']).not.toBe(vector.said);
  });
});
