# ADR-020 — Select a code-signing method before release preparation

Status: Approved (D-09). Method NOT chosen. Investigation in docs/code-signing.md (W1-12, not yet written). Nothing purchased.
Date recorded: 2026-11-01

## Context
Unsigned installers raise warnings and AV false positives.

## Decision
Choose the method by end of Week 2 and sign release candidates from Week 14 at the latest; no self-signed certificates for customers.

## Alternatives considered
Microsoft Store MSIX; external OV/EV-signed installer.

## Consequences
Lead time and eligibility for an Egypt-based developer must be confirmed with the issuer.

## Evidence and links
docs/code-signing.md (W1-12, not yet written).
