# ADR-008 — UUIDv7 public ids, idempotency keys, gapless numbering

Status: Approved (rule 3). Not yet implemented.
Date recorded: 2026-11-01

## Context
Double submits and retries must never create two documents; invoice numbers must not have gaps.

## Decision
Integer primary keys plus `uuid` per business document; renderer-generated `command_id` with a unique `command_log`; document numbers allocated inside the posting transaction.

## Alternatives considered
UUID primary keys; separate idempotency middleware.

## Consequences
Every state-changing financial command carries a command id; a rollback also rolls back the counter.

## Evidence and links
[02-architecture.md](../02-architecture.md) §5.
