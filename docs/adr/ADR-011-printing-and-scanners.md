# ADR-011 — Receipt printing via the Windows driver; keyboard-wedge scanners

Status: Proposed. Physical compatibility testing BLOCKED until real hardware is available (W1-09).
Date recorded: 2026-11-01

## Context
Arabic shaping and bidi are error-prone with raw ESC/POS; scanners are keyboard devices affected by keyboard layout.

## Decision
Render receipts as HTML in a hidden window and print through the printer driver; raw ESC/POS only for the cash-drawer pulse (and possibly raster fallback); detect scans by inter-key timing and read `KeyboardEvent.code`; print is outside the financial transaction.

## Alternatives considered
ESC/POS text with code pages (shaping problems); raster-only printing.

## Consequences
Hardware abstraction layer and mocks first; real-device results are the only evidence for compatibility claims.

## Evidence and links
None physical yet. See Week 1 review.
