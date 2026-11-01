# ADR-013 — ETA readiness without a compliance claim

Status: Approved (rule 12, D-03).
Date recorded: 2026-11-01

## Context
Egyptian tax e-invoicing/e-receipt duties vary per shop and must be verified against current official documentation.

## Decision
No tax calculation in the prototype; reserve nullable tax fields, `snapshot_json`, UUIDs and an outbox design; never state compliance until implemented and verified.

## Alternatives considered
Build ETA integration now (unverified requirements).

## Consequences
Each pilot shop's tax/ETA obligations must be checked before real-world invoicing.

## Evidence and links
[decisions.md](../decisions.md) D-03.
