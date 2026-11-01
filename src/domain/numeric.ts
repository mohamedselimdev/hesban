export class NumericError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'NumericError';
    this.code = code;
  }
}

export function assertSafeInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new NumericError('NOT_SAFE_INTEGER', `${what} must be a safe integer, got ${value}`);
  }
}

/** Converts a bigint result back to number, refusing values outside the safe integer range. */
export function toSafeNumber(value: bigint, what: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new NumericError('OVERFLOW', `${what} exceeds the safe integer range`);
  }
  return Number(value);
}

/** Integer division of n by d, rounding half away from zero. d must not be zero. */
export function roundDiv(n: bigint, d: bigint): bigint {
  if (d === 0n) {
    throw new NumericError('DIVISION_BY_ZERO', 'division by zero');
  }
  const negative = n < 0n !== d < 0n;
  const absN = n < 0n ? -n : n;
  const absD = d < 0n ? -d : d;
  const q = absN / absD;
  const r = absN % absD;
  const rounded = r * 2n >= absD ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** round(a * b / c) with exact bigint intermediates, half away from zero. */
export function mulDivRound(a: number, b: number, c: number): number {
  assertSafeInteger(a, 'a');
  assertSafeInteger(b, 'b');
  assertSafeInteger(c, 'c');
  return toSafeNumber(roundDiv(BigInt(a) * BigInt(b), BigInt(c)), 'mulDivRound result');
}

/**
 * Splits total across weights by the largest-remainder method.
 * Result sums to total exactly. Ties go to the lowest index. Weights must be non-negative.
 */
export function allocateByWeight(total: number, weights: readonly number[]): number[] {
  assertSafeInteger(total, 'total');
  if (weights.length === 0) {
    if (total === 0) return [];
    throw new NumericError('NO_WEIGHTS', 'cannot allocate a non-zero total to no weights');
  }
  let sumWeights = 0n;
  for (const w of weights) {
    assertSafeInteger(w, 'weight');
    if (w < 0) throw new NumericError('NEGATIVE_WEIGHT', 'weights must be non-negative');
    sumWeights += BigInt(w);
  }
  if (sumWeights === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new NumericError('ZERO_WEIGHTS', 'cannot allocate a non-zero total to zero weights');
  }

  const sign = total < 0 ? -1n : 1n;
  const absTotal = BigInt(total) * sign;
  const floors: bigint[] = [];
  const remainders: bigint[] = [];
  let assigned = 0n;
  for (const w of weights) {
    const product = absTotal * BigInt(w);
    const share = product / sumWeights;
    floors.push(share);
    remainders.push(product % sumWeights);
    assigned += share;
  }

  let leftover = Number(absTotal - assigned);
  const order = weights
    .map((_, i) => i)
    .sort((i, j) => {
      const ri = remainders[i] as bigint;
      const rj = remainders[j] as bigint;
      if (ri === rj) return i - j;
      return ri > rj ? -1 : 1;
    });
  for (const i of order) {
    if (leftover === 0) break;
    if ((weights[i] as number) === 0) continue;
    floors[i] = (floors[i] as bigint) + 1n;
    leftover -= 1;
  }
  return floors.map((f) => toSafeNumber(f * sign, 'allocation'));
}
