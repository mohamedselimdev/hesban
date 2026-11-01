# ADR-019 — Windows 11 x64 primary; Windows 10 conditional

Status: Approved (D-10). Windows 10 checks NOT done.
Date recorded: 2026-11-01

## Context
Security-update eligibility of customer PCs and Electron's supported-OS list are unverified.

## Decision
Support Windows 11 x64. Add Windows 10 only after confirming update eligibility of the customer's build, the Electron major's supported-OS list and real hardware tests. No Windows 7/8.

## Alternatives considered
Treat Windows 10 as equal now.

## Consequences
A customer-fleet inventory is needed before promising Windows 10.

## Evidence and links
None yet.
