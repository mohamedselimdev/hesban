import { normalizeDigits, toArabicIndic } from './digits';
import {
  NumericError,
  allocateByWeight,
  assertSafeInteger,
  mulDivRound,
  toSafeNumber,
} from './numeric';

declare const piastreBrand: unique symbol;

/** Integer piastres (1 EGP = 100). Never a float. */
export type Piastres = number & { readonly [piastreBrand]: true };

export function piastres(value: number): Piastres {
  assertSafeInteger(value, 'piastres');
  return value as Piastres;
}

export const ZERO: Piastres = 0 as Piastres;

export function add(a: Piastres, b: Piastres): Piastres {
  return piastres(a + b);
}

export function sub(a: Piastres, b: Piastres): Piastres {
  return piastres(a - b);
}

export function neg(a: Piastres): Piastres {
  return piastres(a === 0 ? 0 : -a);
}

export function sum(values: readonly Piastres[]): Piastres {
  let total = 0n;
  for (const v of values) total += BigInt(v);
  return piastres(toSafeNumber(total, 'sum'));
}

/** round(base * basisPoints / 10000); 1250 basis points = 12.5%. */
export function percentOf(base: Piastres, basisPoints: number): Piastres {
  return piastres(mulDivRound(base, basisPoints, 10000));
}

/** Splits total proportionally to weights; result sums exactly to total (largest remainder). */
export function allocate(total: Piastres, weights: readonly number[]): Piastres[] {
  return allocateByWeight(total, weights) as Piastres[];
}

const EGP_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parses user text such as "12.5", "١٢٫٥٠" into piastres. Rejects anything else. */
export function parseEgp(input: string): Piastres {
  const text = normalizeDigits(input.trim());
  const match = EGP_PATTERN.exec(text);
  if (!match) {
    throw new NumericError('INVALID_AMOUNT', `invalid amount: ${input}`);
  }
  const [, sign, whole, fraction = ''] = match;
  const pt = BigInt(whole as string) * 100n + BigInt(fraction.padEnd(2, '0'));
  return piastres(toSafeNumber(sign ? -pt : pt, 'amount'));
}

export type DigitStyle = 'western' | 'arabic-indic';

/** Formats piastres as "12.50" (no grouping). */
export function formatEgp(value: Piastres, style: DigitStyle = 'western'): string {
  const negative = value < 0;
  const abs = BigInt(value) * (negative ? -1n : 1n);
  const whole = abs / 100n;
  const fraction = String(abs % 100n).padStart(2, '0');
  const ascii = `${negative ? '-' : ''}${whole}.${fraction}`;
  return style === 'arabic-indic' ? toArabicIndic(ascii) : ascii;
}
