# ADR-003 — SQLite runs in the main process; heavy reads in worker threads

Status: Proposed — not yet implemented (starts Week 2).
Date recorded: 2026-11-01

## Context
`better-sqlite3` is synchronous; the renderer must never touch the database.

## Decision
Single writer connection in the main process with short transactions; reports, exports, integrity check and backup verification in worker threads using read-only connections (WAL allows concurrent readers).

## Alternatives considered
Dedicated utility process for all DB work (more isolation, more IPC and complexity); DB in renderer (rejected, security).

## Consequences
Long operations must never run on the main thread; transaction duration budget (< 50 ms typical) must be tested.

## Evidence and links
Posting-like 20-line transaction p95 1.67 ms plain / 2.25 ms encrypted ([ADR-002](ADR-002-sqlcipher-spike.md)).
