# ADR-012 — Offline signed licence; expiry never blocks data access or export

Status: Approved principle (rule 10); mechanism Proposed, built Week 14.
Date recorded: 2026-11-01

## Context
Subscription pricing is a business hypothesis; customers must always reach their data.

## Decision
Ed25519-signed licence with plan data (not constants); state machine active → grace → read-only; read-only keeps view, report, export, backup and restore; private key lives only in a separate issuer tool.

## Alternatives considered
Online activation; hard lock-out.

## Consequences
Client-side licensing is a deterrent, not DRM; clock-rollback detection is best effort.

## Evidence and links
[05-threat-model.md](../05-threat-model.md) T25–T28.
