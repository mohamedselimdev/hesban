# ADR-016 — Negative stock prohibited

Status: Approved (D-02).
Date recorded: 2026-11-01

## Context
Estimated-cost selling corrupts COGS and weakens audit.

## Decision
Any posting that would make quantity < 0 is rejected for every role including Owner; unconditional CHECK `qty_milli >= 0` and `value_pt >= 0`; no setting.

## Alternatives considered
Owner-enabled negative stock with estimated cost (rejected).

## Consequences
Shops must enter purchases/adjustments before selling; the UI must explain the rejection and the fix.

## Evidence and links
[04-business-rules.md](../04-business-rules.md) §4.
