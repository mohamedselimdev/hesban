import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocateByWeight, mulDivRound, roundDiv } from '../../src/domain/numeric';

describe('roundDiv', () => {
  it('rounds half away from zero', () => {
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(-5n, 2n)).toBe(-3n);
    expect(roundDiv(5n, -2n)).toBe(-3n);
    expect(roundDiv(-5n, -2n)).toBe(3n);
    expect(roundDiv(4n, 3n)).toBe(1n);
    expect(roundDiv(-4n, 3n)).toBe(-1n);
    expect(roundDiv(1n, 3n)).toBe(0n);
    expect(roundDiv(0n, 7n)).toBe(0n);
  });

  it('rejects division by zero', () => {
    expect(() => roundDiv(1n, 0n)).toThrow('division by zero');
  });
});

describe('mulDivRound', () => {
  it('computes the fractional-kg example: 0.350 kg at 85.50 EGP = 29.93 EGP', () => {
    expect(mulDivRound(8550, 350, 1000)).toBe(2993);
  });

  it('handles products above 2^53 exactly', () => {
    const a = 9_000_000_000_000_000;
    expect(mulDivRound(a, 3, 3)).toBe(a);
    expect(() => mulDivRound(a, 2, 1)).toThrow('safe integer');
  });

  it('rejects non-integers', () => {
    expect(() => mulDivRound(1.5, 1, 1)).toThrow('safe integer');
  });

  it('matches an independent bigint reference model', () => {
    const safe = fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 });
    const divisor = safe.filter((n) => n !== 0);
    fc.assert(
      fc.property(safe, fc.integer({ min: -1_000_000, max: 1_000_000 }), divisor, (a, b, c) => {
        const num = BigInt(a) * BigInt(b);
        const den = BigInt(c);
        // reference: floor-based half-away-from-zero using sign handling
        const sign = num < 0n !== den < 0n ? -1n : 1n;
        const an = num < 0n ? -num : num;
        const ad = den < 0n ? -den : den;
        const ref = sign * ((2n * an + ad) / (2n * ad));
        const expected = Number(ref);
        if (!Number.isSafeInteger(expected)) return true;
        return mulDivRound(a, b, c) === expected;
      }),
      { numRuns: 10_000 },
    );
  });
});

describe('allocateByWeight', () => {
  it('splits evenly with deterministic remainder to lowest index', () => {
    expect(allocateByWeight(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('is proportional', () => {
    expect(allocateByWeight(1000, [1, 3])).toEqual([250, 750]);
  });

  it('handles zero weights among non-zero', () => {
    expect(allocateByWeight(5, [0, 1, 0])).toEqual([0, 5, 0]);
  });

  it('handles negative totals symmetrically', () => {
    expect(allocateByWeight(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it('empty and zero cases', () => {
    expect(allocateByWeight(0, [])).toEqual([]);
    expect(allocateByWeight(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocateByWeight(1, [])).toThrow();
    expect(() => allocateByWeight(1, [0, 0])).toThrow();
    expect(() => allocateByWeight(1, [-1, 2])).toThrow('non-negative');
  });

  it('always sums exactly to total and keeps sign for non-negative weights', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 30 }),
        (total, weights) => {
          if (weights.every((w) => w === 0)) return true;
          const parts = allocateByWeight(total, weights);
          const s = parts.reduce((x, y) => x + y, 0);
          const signOk = parts.every((p) => (total >= 0 ? p >= 0 : p <= 0));
          const zeroWeightGetsZero = parts.every((p, i) => weights[i] !== 0 || p === 0);
          return s === total && signOk && zeroWeightGetsZero;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('each share is within 1 piastre of the exact proportion', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 20 }),
        (total, weights) => {
          const parts = allocateByWeight(total, weights);
          const sumW = weights.reduce((a, b) => a + b, 0);
          return parts.every((p, i) => {
            const exact = (total * (weights[i] as number)) / sumW;
            return Math.abs(p - exact) < 1;
          });
        },
      ),
      { numRuns: 5_000 },
    );
  });
});
