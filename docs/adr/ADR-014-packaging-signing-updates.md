# ADR-014 — Packaging, code signing and updates

Status: Proposed. Signing method: see [../code-signing.md](../code-signing.md) and ADR-020 (recommendation: NSIS installer signed with an OV certificate; awaiting owner confirmation). No purchase made.
Date recorded: 2026-11-01

## Context
Unsigned installers trigger SmartScreen/AV warnings; v1 is offline-first.

## Decision
electron-builder (NSIS) with Electron Fuses and ASAR integrity; manual installer updates in v1; signing method to be chosen by end of Week 2.

## Alternatives considered
Electron Forge; MSIX via Microsoft Store; auto-update in v1.

## Consequences
Fuses are verified on a copy of `electron.exe` only until a packaged build exists (Week 14).

## Evidence and links
`tools/fuses.mjs`, `tools/verify-build.mjs --fuses`.
