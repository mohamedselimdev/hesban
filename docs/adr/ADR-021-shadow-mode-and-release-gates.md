# ADR-021 — Shadow-mode pilot and release gates

Status: Approved.
Date recorded: 2026-11-01

## Context
A shop cannot use an unproven system as its only financial record.

## Decision
Shadow mode from Weeks 11–12: HESBAN runs beside the shop's existing system, never the sole record; daily comparison. Shadow success is evidence, not acceptance; release requires the gates in [06-testing-strategy.md](../06-testing-strategy.md) §10.

## Alternatives considered
Go live at Week 15 and count a 30-day pilot as acceptance (rejected).

## Consequences
The release date moves if gates fail; features are cut before accounting, security or recovery testing.

## Evidence and links
[decisions.md](../decisions.md).
