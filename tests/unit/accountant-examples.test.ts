import { describe, expect, it } from 'vitest';
import { allocateByWeight, mulDivRound } from '../../src/domain/numeric';
import { lineTotal, milli } from '../../src/domain/qty';
import { piastres } from '../../src/domain/money';

/**
 * Worked examples used in docs/accountant-review-checklist.md. Each number printed there is
 * computed here with the same domain functions the application will use, so the checklist can
 * never show a figure the code does not produce. This is arithmetic evidence only; it is NOT an
 * accountant's approval of the accounting treatment (status: PENDING).
 */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Cumulative-method share: returns the amount for each successive return quantity. */
function cumulativeShares(total: number, totalQty: number, returns: number[]): number[] {
  let cumQty = 0;
  let paid = 0;
  return returns.map((q) => {
    cumQty += q;
    const cumulative = mulDivRound(total, cumQty, totalQty);
    const share = cumulative - paid;
    paid = cumulative;
    return share;
  });
}

interface JournalLine {
  account: number;
  debit: number;
  credit: number;
}
const balanced = (lines: JournalLine[]) =>
  sum(lines.map((l) => l.debit)) === sum(lines.map((l) => l.credit));

describe('checklist example A — purchase discount and extra-cost allocation', () => {
  it('A1: discount 1,500 over lines 10,000 / 20,000 / 30,000 piastres', () => {
    const parts = allocateByWeight(1500, [10000, 20000, 30000]);
    expect(parts).toEqual([250, 500, 750]);
    const inventory = [10000, 20000, 30000].map((v, i) => v - (parts[i] as number));
    expect(inventory).toEqual([9750, 19500, 29250]);
    expect(sum(inventory)).toBe(58500);
  });

  it('A2: discount 1,000 does not divide evenly; the largest remainder gets the extra piastre', () => {
    expect(allocateByWeight(1000, [10000, 20000, 30000])).toEqual([167, 333, 500]);
  });

  it('A3: eligible extra cost 1,000 allocated by net line value 9,750 / 19,500 / 29,250', () => {
    expect(allocateByWeight(1000, [9750, 19500, 29250])).toEqual([167, 333, 500]);
  });
});

describe('checklist example B — weighted-average cost', () => {
  it('B1: 10.000 units worth 500.00, buy 5.000 for 300.00, sell 4.000 then the rest', () => {
    let qty = 10000;
    let value = 50000;
    qty += 5000;
    value += 30000;
    expect([qty, value]).toEqual([15000, 80000]);

    const cogs1 = mulDivRound(value, 4000, qty); // 21,333.33 → 21,333
    expect(cogs1).toBe(21333);
    qty -= 4000;
    value -= cogs1;
    expect([qty, value]).toEqual([11000, 58667]);

    const cogs2 = qty === 11000 ? value : mulDivRound(value, 11000, qty); // last unit takes remainder
    expect(cogs2).toBe(58667);
    expect(value - cogs2).toBe(0);
  });

  it('B2: an exact half rounds away from zero (5 piastres over 2.000 units, issue 1.000 → 3)', () => {
    expect(mulDivRound(5, 1000, 2000)).toBe(3);
  });
});

describe('checklist example C — sale with invoice discount', () => {
  it('C1: lines 2 × 85.50 and 1 × 450.00 with invoice discount 30.00', () => {
    const l1 = lineTotal(piastres(8550), milli(2000));
    const l2 = lineTotal(piastres(45000), milli(1000));
    expect([l1, l2]).toEqual([17100, 45000]);
    const discount = allocateByWeight(3000, [l1, l2]);
    expect(discount).toEqual([826, 2174]);
    expect(sum(discount)).toBe(3000);
    expect([l1 - (discount[0] as number), l2 - (discount[1] as number)]).toEqual([16274, 42826]);
  });

  it('C2: partly paid credit sale posts a balanced journal (gross revenue, separate discount)', () => {
    const total = 62100 - 3000; // 591.00
    const paidCash = 20000;
    const receivable = total - paidCash;
    const entry: JournalLine[] = [
      { account: 1100, debit: paidCash, credit: 0 },
      { account: 1200, debit: receivable, credit: 0 },
      { account: 4150, debit: 3000, credit: 0 },
      { account: 4100, debit: 0, credit: 62100 },
    ];
    expect(receivable).toBe(39100);
    expect(balanced(entry)).toBe(true);
    const cogs: JournalLine[] = [
      { account: 5100, debit: 40000, credit: 0 },
      { account: 1300, debit: 0, credit: 40000 },
    ];
    expect(balanced(cogs)).toBe(true);
  });

  it('C3: 0.350 kg at 85.50 EGP per kg = 29.93 EGP (2,992.5 rounds half away from zero)', () => {
    expect(lineTotal(piastres(8550), milli(350))).toBe(2993);
  });
});

describe('checklist example D — partial returns (cumulative method)', () => {
  it('D1: refund of a line with net 89.99 (3 pieces) returned one piece at a time', () => {
    const shares = cumulativeShares(8999, 3000, [1000, 1000, 1000]);
    expect(shares).toEqual([3000, 2999, 3000]);
    expect(sum(shares)).toBe(8999);
  });

  it('D2: the same line returned in one go or in a different split gives the same total', () => {
    expect(sum(cumulativeShares(8999, 3000, [3000]))).toBe(8999);
    expect(sum(cumulativeShares(8999, 3000, [2000, 1000]))).toBe(8999);
    expect(cumulativeShares(8999, 3000, [3000])).toEqual([8999]);
  });

  it('D3: cost restored at original cost 213.33 for 4 pieces, returned one at a time', () => {
    const shares = cumulativeShares(21333, 4000, [1000, 1000, 1000, 1000]);
    expect(shares).toEqual([5333, 5334, 5333, 5333]);
    expect(sum(shares)).toBe(21333);
  });

  it('D4: cumulative refund can never exceed the original line total', () => {
    for (let split = 1; split <= 12; split++) {
      const unit = 3000 / split;
      if (!Number.isInteger(unit)) continue;
      const shares = cumulativeShares(8999, 3000, Array<number>(split).fill(unit));
      expect(sum(shares)).toBe(8999);
      expect(Math.min(...shares)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('checklist example E — receivables, payments and cash', () => {
  const allocateFifo = (outstanding: number[], payment: number) => {
    let left = payment;
    const parts = outstanding.map((o) => {
      const take = Math.min(o, left);
      left -= take;
      return take;
    });
    return { parts, credit: left };
  };

  it('E1: payment 80.00 against invoices owing 50.00 and 70.00, oldest first', () => {
    expect(allocateFifo([5000, 7000], 8000)).toEqual({ parts: [5000, 3000], credit: 0 });
  });

  it('E2: payment 130.00 pays both invoices and leaves 10.00 customer credit', () => {
    expect(allocateFifo([5000, 7000], 13000)).toEqual({ parts: [5000, 7000], credit: 1000 });
  });

  it('E3: expected drawer cash and a shortage', () => {
    const expected = 20000 + 150000 + 30000 - 5000 - 40000 - 10000 - 20000;
    expect(expected).toBe(125000);
    const counted = 124500;
    const overShort = counted - expected;
    expect(overShort).toBe(-500);
    const entry: JournalLine[] = [
      { account: 6950, debit: -overShort, credit: 0 },
      { account: 1100, debit: 0, credit: -overShort },
    ];
    expect(balanced(entry)).toBe(true);
  });

  it('E4: opening balances balance against opening-balance equity', () => {
    const customer: JournalLine[] = [
      { account: 1200, debit: 123450, credit: 0 },
      { account: 3400, debit: 0, credit: 123450 },
    ];
    expect(balanced(customer)).toBe(true);
  });
});
