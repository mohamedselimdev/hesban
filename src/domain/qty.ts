import { normalizeDigits, toArabicIndic } from './digits';
import { NumericError, assertSafeInteger, mulDivRound, toSafeNumber } from './numeric';
import { type DigitStyle, type Piastres, piastres } from './money';

declare const milliBrand: unique symbol;

/** Integer thousandths of the base unit (1.000 kg = 1000). */
export type Milli = number & { readonly [milliBrand]: true };

export function milli(value: number): Milli {
  assertSafeInteger(value, 'quantity');
  return value as Milli;
}

const QTY_PATTERN = /^(\d+)(?:\.(\d{1,3}))?$/;

/** Parses non-negative quantity text with up to 3 decimals. */
export function parseQty(input: string): Milli {
  const text = normalizeDigits(input.trim());
  const match = QTY_PATTERN.exec(text);
  if (!match) {
    throw new NumericError('INVALID_QUANTITY', `invalid quantity: ${input}`);
  }
  const [, whole, fraction = ''] = match;
  const value = BigInt(whole as string) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return milli(toSafeNumber(value, 'quantity'));
}

/** Formats thousandths as "0.350", or "2" for whole quantities when trimmed. */
export function formatQty(value: Milli, style: DigitStyle = 'western'): string {
  const negative = value < 0;
  const abs = BigInt(value) * (negative ? -1n : 1n);
  const whole = abs / 1000n;
  const fraction = String(abs % 1000n)
    .padStart(3, '0')
    .replace(/0+$/, '');
  const ascii = `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
  return style === 'arabic-indic' ? toArabicIndic(ascii) : ascii;
}

/** round(unitPrice * qty / 1000), half away from zero. */
export function lineTotal(unitPrice: Piastres, qty: Milli): Piastres {
  return piastres(mulDivRound(unitPrice, qty, 1000));
}
