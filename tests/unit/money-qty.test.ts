import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ZERO,
  add,
  allocate,
  formatEgp,
  neg,
  parseEgp,
  percentOf,
  piastres,
  sub,
  sum,
} from '../../src/domain/money';
import { formatQty, lineTotal, milli, parseQty } from '../../src/domain/qty';
import { normalizeDigits } from '../../src/domain/digits';

describe('money', () => {
  it('rejects non-integer and unsafe values', () => {
    expect(() => piastres(1.5)).toThrow('safe integer');
    expect(() => piastres(Number.MAX_SAFE_INTEGER + 1)).toThrow('safe integer');
    expect(() => piastres(NaN)).toThrow();
    expect(() => add(piastres(Number.MAX_SAFE_INTEGER), piastres(1))).toThrow();
  });

  it('adds, subtracts, negates; never returns negative zero', () => {
    expect(add(piastres(150), piastres(250))).toBe(400);
    expect(sub(piastres(150), piastres(250))).toBe(-100);
    expect(Object.is(neg(ZERO), 0)).toBe(true);
    expect(sum([piastres(1), piastres(2), piastres(3)])).toBe(6);
    expect(sum([])).toBe(0);
  });

  it('parses and formats EGP', () => {
    expect(parseEgp('12')).toBe(1200);
    expect(parseEgp('12.5')).toBe(1250);
    expect(parseEgp('12.05')).toBe(1205);
    expect(parseEgp('0.01')).toBe(1);
    expect(parseEgp('-3.20')).toBe(-320);
    expect(parseEgp('١٢٫٥٠')).toBe(1250);
    expect(parseEgp('۱۲٫۵۰')).toBe(1250);
    expect(formatEgp(piastres(1250))).toBe('12.50');
    expect(formatEgp(piastres(5))).toBe('0.05');
    expect(formatEgp(piastres(-320))).toBe('-3.20');
    expect(formatEgp(piastres(1250), 'arabic-indic')).toBe('١٢٫٥٠');
  });

  it('rejects malformed amounts', () => {
    for (const bad of ['', 'abc', '1.234', '1,5', '--1', '1e3', '.5', '1.', '١٢.٣٤٥']) {
      expect(() => parseEgp(bad), bad).toThrow('invalid amount');
    }
  });

  it('parse(format(x)) round-trips', () => {
    fc.assert(
      fc.property(fc.integer({ min: -9_000_000_000_000_000, max: 9_000_000_000_000_000 }), (n) => {
        const p = piastres(n);
        return parseEgp(formatEgp(p)) === p && parseEgp(formatEgp(p, 'arabic-indic')) === p;
      }),
      { numRuns: 10_000 },
    );
  });

  it('percentOf rounds half away from zero', () => {
    expect(percentOf(piastres(1000), 1250)).toBe(125);
    expect(percentOf(piastres(1), 5000)).toBe(1); // 0.5 -> 1
    expect(percentOf(piastres(-1), 5000)).toBe(-1);
    expect(percentOf(piastres(999), 1000)).toBe(100); // 99.9 -> 100
  });

  it('allocate sums to total', () => {
    const parts = allocate(piastres(1000), [3333, 3333, 3334]);
    expect(sum(parts)).toBe(1000);
  });
});

describe('qty', () => {
  it('parses and formats thousandths', () => {
    expect(parseQty('1')).toBe(1000);
    expect(parseQty('0.350')).toBe(350);
    expect(parseQty('0.001')).toBe(1);
    expect(parseQty('٠٫٣٥')).toBe(350);
    expect(formatQty(milli(350))).toBe('0.35');
    expect(formatQty(milli(2000))).toBe('2');
    expect(formatQty(milli(1))).toBe('0.001');
    expect(formatQty(milli(1500), 'arabic-indic')).toBe('١٫٥');
  });

  it('rejects malformed quantities', () => {
    for (const bad of ['', '-1', '1.2345', 'x', '1,5']) {
      expect(() => parseQty(bad), bad).toThrow('invalid quantity');
    }
  });

  it('line total examples', () => {
    expect(lineTotal(piastres(8550), parseQty('0.350'))).toBe(2993);
    expect(lineTotal(piastres(1000), parseQty('3'))).toBe(3000);
    expect(lineTotal(piastres(1), parseQty('0.001'))).toBe(0);
    expect(lineTotal(piastres(1), parseQty('0.500'))).toBe(1); // exact half rounds up
    expect(lineTotal(piastres(0), parseQty('5'))).toBe(0);
  });
});

describe('digits', () => {
  it('normalises Arabic-Indic and Persian digits and separators', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeDigits('١٬٢٣٤٫٥')).toBe('1234.5');
    expect(normalizeDigits(' 1 2 ')).toBe('12');
    expect(normalizeDigits('abc')).toBe('abc');
  });
});
