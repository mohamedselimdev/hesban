# ADR-001 — Desktop shell: Electron

Status: Accepted (Electron 45.2.1 in use). Windows 10 support still unverified (D-10, ADR-019).
Date recorded: 2026-11-01

## Context
Single developer, TypeScript end to end, strong Arabic text rendering, offline desktop, Windows retail PCs.

## Decision
Use Electron, pinned to a supported stable major; security patch releases adopted within 30 days.

## Alternatives considered
Tauri (Rust backend, smaller, but second language and less proven WebView2 printing); .NET WinUI/WPF (best native hardware fit, different stack); local web server + browser (extra attack surface).

## Consequences
Large install and RAM footprint; must track Chromium/Electron security releases; native modules need Electron ABI compatibility (verified for SQLite, ADR-002).

## Evidence and links
W1-03 secure shell tests (`tests/security`, `tests/electron/runtime.test.ts`); [02-architecture.md](../02-architecture.md) §4.
