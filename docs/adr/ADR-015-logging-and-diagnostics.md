# ADR-015 — Local logging and diagnostics bundle

Status: Proposed — not implemented.
Date recorded: 2026-11-01

## Context
Support without internet; logs must not leak secrets or customer data.

## Decision
Rotating local logs (pino) with scrubbing rules; one-click diagnostics bundle reviewed by the user before sharing.

## Alternatives considered
Remote telemetry (out of scope for v1).

## Consequences
Log-scrubbing tests required; IPC currently logs only channel, code and correlation id.

## Evidence and links
`src/main/ipc/registry.ts` logging entry shape.
