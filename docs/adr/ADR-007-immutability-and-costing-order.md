# ADR-007 — Immutable posted documents, reversal documents, posting-order costing, locked periods

Status: Approved (D-04, rule 5). Not yet implemented.
Date recorded: 2026-11-01

## Context
Audit integrity and exact historical COGS.

## Decision
Posted documents change only by counter-documents; database triggers abort UPDATE/DELETE on ledgers and posted rows; weighted-average cost follows posting sequence, never retroactively recosted; closed business dates reject postings.

## Alternatives considered
Editable invoices with history; business-date-ordered costing.

## Consequences
Corrections are explicit documents; backdating is restricted; triggers protect against bugs and casual tampering only (see threat model T10).

## Evidence and links
[03-data-model.md](../03-data-model.md) §5; [04-business-rules.md](../04-business-rules.md) §3–4.
