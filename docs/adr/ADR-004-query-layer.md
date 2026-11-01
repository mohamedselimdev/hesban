# ADR-004 — Query layer: hand-written SQL migrations, Kysely for typed queries

Status: Proposed — migration runner implemented with plain SQL files (W1-05); Kysely not yet adopted.
Date recorded: 2026-11-01

## Context
Financial SQL (aggregations, locking behaviour) must stay explicit and reviewable.

## Decision
Forward-only numbered `.sql` migrations with checksums (implemented). Adopt Kysely for typed queries when the first repositories are written (Week 2); revisit if it adds friction with the SQLCipher driver types.

## Alternatives considered
Drizzle, Prisma (heavy engine binaries), TypeORM, raw SQL strings only.

## Consequences
Kysely adoption is a Week 2 decision gate; until then no query-builder code exists.

## Evidence and links
`src/infrastructure/db/migrations/runner.ts`, `tests/integration/migrations.test.ts` (19 tests).
