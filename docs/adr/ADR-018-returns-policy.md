# ADR-018 — Returns only against an original posted invoice

Status: Approved (D-12).
Date recorded: 2026-11-01

## Context
Returns without an invoice are a primary fraud vector.

## Decision
Remaining returnable quantity (sold − Σ posted non-reversed returns) is enforced inside `BEGIN IMMEDIATE`; refund per line capped at the original line value; duplicates blocked by `command_id` and the cap; no override path.

## Alternatives considered
Owner-only manual return workaround (removed).

## Consequences
Customers without a receipt need the invoice found by number, date or customer.

## Evidence and links
[04-business-rules.md](../04-business-rules.md) §5.3.
