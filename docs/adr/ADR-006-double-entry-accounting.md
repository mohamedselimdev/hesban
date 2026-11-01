# ADR-006 — Internal double-entry accounting with a fixed chart of accounts

Status: Approved (D-01). Not yet implemented. Accountant review is a hard gate before Week 4.
Date recorded: 2026-11-01

## Context
Operational ledgers alone have no independent cross-check; shop owners must not see accounting jargon.

## Decision
A posting engine writes balanced journal entries in the same transaction as each document; fixed seeded chart; discounts recorded separately (account 4150), reports show net revenue.

## Alternatives considered
Operational ledgers only; user-visible full accounting.

## Consequences
About 1–1.5 weeks extra; invariant tests INV-A…INV-L depend on it; return and extra-cost journal mappings need accountant confirmation.

## Evidence and links
[04-business-rules.md](../04-business-rules.md) §5–6.
