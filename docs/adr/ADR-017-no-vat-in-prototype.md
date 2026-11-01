# ADR-017 — No VAT calculation in the prototype

Status: Approved (D-03).
Date recorded: 2026-11-01

## Context
Tax obligations differ per shop and need verification.

## Decision
No tax arithmetic; entered price is the final price; tax fields and architecture reserved.

## Alternatives considered
Implement VAT now.

## Consequences
Not suitable for shops that must issue tax invoices until a verified tax release.

## Evidence and links
[decisions.md](../decisions.md).
