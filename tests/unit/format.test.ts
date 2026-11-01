import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseEgp, piastres } from '../../src/domain/money';
import { milli } from '../../src/domain/qty';
import {
  cairoDate,
  cairoUtcOffsetMinutes,
  formatBusinessDate,
  formatDateTime,
  formatMoney,
  formatMoneyWithCurrency,
  formatQuantity,
  isolateLtr,
} from '../../src/renderer/i18n/format';
import { ar, t } from '../../src/renderer/i18n/ar';

describe('formatMoney', () => {
  it('groups thousands and keeps two decimals', () => {
    expect(formatMoney(piastres(0))).toBe('0.00');
    expect(formatMoney(piastres(5))).toBe('0.05');
    expect(formatMoney(piastres(99999))).toBe('999.99');
    expect(formatMoney(piastres(100000))).toBe('1,000.00');
    expect(formatMoney(piastres(123456789))).toBe('1,234,567.89');
    expect(formatMoney(piastres(-123456))).toBe('-1,234.56');
  });

  it('uses Arabic-Indic digits and separators on request', () => {
    expect(formatMoney(piastres(123456789), 'arabic-indic')).toBe('١٬٢٣٤٬٥٦٧٫٨٩');
    expect(formatMoney(piastres(-50), 'arabic-indic')).toBe('-٠٫٥٠');
  });

  it('survives the largest safe amount', () => {
    const text = formatMoney(piastres(Number.MAX_SAFE_INTEGER));
    expect(text).toBe('90,071,992,547,409.91');
  });

  it('display text parses back to the same piastres once grouping is removed', () => {
    fc.assert(
      fc.property(fc.integer({ min: -9_000_000_000_000_000, max: 9_000_000_000_000_000 }), (n) => {
        const p = piastres(n);
        const western = formatMoney(p).replace(/,/g, '');
        const indic = formatMoney(p, 'arabic-indic');
        return parseEgp(western) === p && parseEgp(indic) === p;
      }),
      { numRuns: 5_000 },
    );
  });

  it('wraps in isolates so RTL text cannot reorder digits', () => {
    const text = formatMoneyWithCurrency(piastres(-123456));
    expect(text).toBe('⁦-1,234.56⁩ ج.م');
    expect(isolateLtr('1')).toBe('⁦1⁩');
  });
});

describe('formatQuantity', () => {
  it('trims trailing zeros and honours digit style', () => {
    expect(formatQuantity(milli(1500))).toBe('1.5');
    expect(formatQuantity(milli(2000))).toBe('2');
    expect(formatQuantity(milli(350), 'arabic-indic')).toBe('٠٫٣٥');
  });
});

describe('dates in Africa/Cairo', () => {
  it('formats winter and summer instants with the right local clock', () => {
    // Offsets come from the platform tz database; asserted below so a stale database is reported.
    expect(formatDateTime('2026-01-15T10:05:00Z')).toBe('15/01/2026 12:05');
    expect(formatDateTime('2026-07-15T10:05:00Z')).toBe('15/07/2026 13:05');
    expect(formatDateTime('2026-07-15T10:05:00Z', 'arabic-indic')).toBe('١٥/٠٧/٢٠٢٦ ١٣:٠٥');
  });

  it('puts a late-night UTC instant on the next Cairo calendar day', () => {
    expect(cairoDate('2026-01-15T22:30:00Z')).toBe('2026-01-16');
    expect(cairoDate('2026-07-15T21:30:00Z')).toBe('2026-07-16');
    expect(cairoDate('2026-07-15T20:59:00Z')).toBe('2026-07-15');
  });

  it('reports a +02:00 winter offset and a +03:00 summer offset (daylight saving in use)', () => {
    expect(cairoUtcOffsetMinutes('2026-01-15T12:00:00Z')).toBe(120);
    expect(cairoUtcOffsetMinutes('2026-07-15T12:00:00Z')).toBe(180);
  });

  it('observes a transition between late March and late April, and back before November', () => {
    const offsets = (iso: string) => cairoUtcOffsetMinutes(iso);
    expect(offsets('2026-03-15T12:00:00Z')).toBe(120);
    expect(offsets('2026-05-15T12:00:00Z')).toBe(180);
    expect(offsets('2026-10-01T12:00:00Z')).toBe(180);
    expect(offsets('2026-11-15T12:00:00Z')).toBe(120);
  });

  it('keeps one calendar day for instants across the spring transition without skipping a date', () => {
    const days: string[] = [];
    for (let h = 0; h < 24 * 5; h += 6) {
      const iso = new Date(Date.UTC(2026, 3, 22, 0) + h * 3_600_000).toISOString();
      const d = cairoDate(iso);
      if (days.at(-1) !== d) days.push(d);
    }
    expect(days).toEqual(['2026-04-22', '2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26']);
  });

  it('formats stored business dates and rejects bad input', () => {
    expect(formatBusinessDate('2026-11-01')).toBe('01/11/2026');
    expect(formatBusinessDate('2026-11-01', 'arabic-indic')).toBe('٠١/١١/٢٠٢٦');
    expect(() => formatBusinessDate('2026-1-1')).toThrow('invalid business date');
    expect(() => formatDateTime('not a date')).toThrow('invalid date');
  });
});

describe('arabic strings', () => {
  it('resolves typed keys and rejects non-string nodes', () => {
    expect(t('appName')).toBe('حسبان');
    expect(t('gallery.title')).toBe(ar.gallery.title);
    // @ts-expect-error unknown key must not compile
    expect(() => t('gallery.missing')).toThrow();
  });

  it('every string contains Arabic letters (no leftover English placeholders)', () => {
    const walk = (node: unknown, path: string): string[] => {
      if (typeof node === 'string') return /[؀-ۿ]/.test(node) ? [] : [path];
      if (Array.isArray(node)) return node.flatMap((n, i) => walk(n, `${path}[${i}]`));
      return Object.entries(node as object).flatMap(([k, v]) => walk(v, path ? `${path}.${k}` : k));
    };
    expect(walk(ar, '')).toEqual([]);
  });
});
