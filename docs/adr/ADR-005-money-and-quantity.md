# ADR-005 — Money in integer piastres, quantity in integer thousandths, BigInt intermediates

Status: Approved and implemented (mandatory rule 1).
Date recorded: 2026-11-01

## Context
Floating point is unacceptable for money; products multiply price × quantity ÷ onHand with large intermediates.

## Decision
Branded safe-integer types `Piastres` and `Milli`; all multiply-then-divide in BigInt with round-half-away-from-zero; largest-remainder allocation; overflow throws.

## Alternatives considered
Decimal libraries (extra dependency, still needs rounding rules); storing floats (rejected).

## Consequences
All arithmetic goes through `src/domain/numeric.ts`, `money.ts`, `qty.ts`; adding a raw `number` operation on money elsewhere is a review failure (lint rule still to be added).

## Evidence and links
`tests/unit/numeric.test.ts`, `money-qty.test.ts` (property tests at 10,000 runs).
