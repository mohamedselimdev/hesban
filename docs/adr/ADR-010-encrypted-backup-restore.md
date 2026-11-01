# ADR-010 — Encrypted backup and restore, including replacement-PC recovery

Status: Approved design (rule 9); container format prototyped in the W1-04 spike; production implementation Week 12.
Date recorded: 2026-11-01

## Context
The database key is wrapped by DPAPI and dies with the Windows profile; backups must survive a replacement PC.

## Decision
`VACUUM INTO` copy (encrypted) inside an AES-256-GCM container keyed by scrypt from an owner passphrase; the container carries the DB key; restore verifies, snapshots current data, swaps atomically, runs integrity checks and re-keys for the new device.

## Alternatives considered
File copy of the live DB (unsafe under WAL); backups keyed only by DPAPI (not portable).

## Consequences
Losing both passphrase and recovery key makes backups unrecoverable (must be stated in the UI); whole-file GCM needs streaming for large databases.

## Evidence and links
[ADR-002 spike](ADR-002-sqlcipher-spike.md): restore with passphrase only, wrong passphrase / bit flips / truncation all rejected.
