/**
 * ISO 17442 LEI check digits (ISO/IEC 7064 mod 97-10), plus a synthetic-LEI
 * factory so fixtures never resemble a real registered entity.
 */

function charValue(char: string): string {
  if (char >= '0' && char <= '9') return char;
  return String(char.charCodeAt(0) - 'A'.charCodeAt(0) + 10);
}

function mod97(digits: string): number {
  let acc = 0;
  for (const digit of digits) acc = (acc * 10 + (digit.charCodeAt(0) - 48)) % 97;
  return acc;
}

function expand(text: string): string {
  return text.split('').map(charValue).join('');
}

export function computeLeiCheckDigits(base18: string): string {
  if (!/^[A-Z0-9]{18}$/.test(base18)) {
    throw new Error('LEI base must be 18 chars of A-Z0-9');
  }

  return String(98 - mod97(expand(base18 + '00'))).padStart(2, '0');
}

export function isValidLei(lei: string): boolean {
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(lei)) return false;
  return mod97(expand(lei)) === 1;
}

/** Synthetic LEIs are visibly fake: tag padded with X to 18, valid check digits. */
export function syntheticLei(tag: string): string {
  if (!/^[A-Z0-9]{1,18}$/.test(tag)) {
    throw new Error('synthetic LEI tag must be 1-18 chars of A-Z0-9');
  }

  const base = tag.padEnd(18, 'X');
  return base + computeLeiCheckDigits(base);
}
