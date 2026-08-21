/**
 * README 那張表要跟實作一致，而且是被逼著一致的。
 *
 * 一張手寫的「誰看到什麼」表格，是一個**關於系統的宣稱**；它會在欄位改動的那一天
 * 悄悄變成假的，而且沒有人會發現——因為沒有東西在看著它。
 *
 * 這個測試把表格降級成實作的一個讀數。它逐欄比對 README 裡的內容與
 * `disclosureDesign()` 的輸出，而後者又是從簽發方用來產生 `_sd` 摘要的同一份 schema
 * 推導出來的。任何一個欄位從公開改成隱藏（或反過來）而表格沒跟著改，這裡就轉紅。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { getCredentialSchema } from '@eas/shared';
import { SEAT_SCOPE, delegationScopeMatches, disclosureDesign } from '@eas/agents';

const README = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');

/** Pulls the backticked identifiers out of one cell of the published table. */
function cellFields(row: string, column: number): string[] {
  const cells = row.split('|').map((cell) => cell.trim());
  const cell = cells[column] ?? '';
  const fields: string[] = [];
  let at = cell.indexOf('`');
  while (at !== -1) {
    const end = cell.indexOf('`', at + 1);
    if (end === -1) break;
    fields.push(cell.slice(at + 1, end));
    at = cell.indexOf('`', end + 1);
  }

  return fields;
}

function publishedRow(label: string): string {
  const row = README.split('\n').find(
    (line) => line.startsWith('|') && line.includes(`**${label}**`),
  );
  if (row === undefined) throw new Error(`no published disclosure row for ${label}`);

  return row;
}

describe('Disclosure Design 表格與實作逐欄一致', () => {
  const design = disclosureDesign();

  test('both seats are published', () => {
    expect(design).toHaveLength(2);
    for (const seat of design) expect(() => publishedRow(seat.label)).not.toThrow();
  });

  test('每個 Seat 的「收到」欄與實作相同', () => {
    for (const seat of design) {
      expect(cellFields(publishedRow(seat.label), 2), `${seat.label} 收到`).toEqual([
        ...seat.receives,
      ]);
    }
  });

  test('每個 Seat 的「未收到」欄與實作相同', () => {
    for (const seat of design) {
      expect(cellFields(publishedRow(seat.label), 3), `${seat.label} 未收到`).toEqual([
        ...seat.withheld,
      ]);
    }
  });
});

describe('表格的來源是 schema，不是另一份清單', () => {
  test('every withheld field for the bank is genuinely hidden in its schema', () => {
    // The point of the whole exercise: the table may not claim protection the
    // credential does not provide.
    const bank = disclosureDesign().find((s) => s.seat === 'BANK_AGENT_A')!;
    const hidden = new Set(bank.scope.flatMap((t) => getCredentialSchema(t).hidden));

    for (const field of bank.withheld) {
      expect(hidden.has(field), `${field} is published as withheld but is not in _sd`).toBe(true);
    }
  });

  test('the brand is denied even the public conclusions', () => {
    // Not a policy check — identity is gone before the agent exists, so there
    // is no per-worker record for it to read.
    const brand = disclosureDesign().find((s) => s.seat === 'BRAND_AGENT_B')!;

    expect(brand.withheld).toContain('withinRBALimit');
    expect(brand.withheld).toContain('workerDID');
    expect(brand.receives).not.toContain('withinRBALimit');
  });

  test('a seat’s published scope matches the mandate it would be granted', () => {
    expect(delegationScopeMatches('BANK_AGENT_A', [...SEAT_SCOPE.BANK_AGENT_A])).toBe(true);
    expect(delegationScopeMatches('BRAND_AGENT_B', ['WorkingHoursCredential'])).toBe(true);
    // A mandate wider than the table would make the table a comforting fiction.
    expect(
      delegationScopeMatches('BRAND_AGENT_B', ['WorkingHoursCredential', 'SalaryDepositCredential']),
    ).toBe(false);
  });
});
