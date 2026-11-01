# ADR-020 — Code signing and distribution method

Status: **Proposed recommendation, awaiting owner confirmation** (D-09 approved the obligation to choose; the choice is not final until a CA confirms Egyptian validation). Nothing purchased, nothing published.
Date recorded: 2026-11-01

## Context
Unsigned installers trigger SmartScreen and antivirus warnings. Options compared in [../code-signing.md](../code-signing.md): Microsoft Store MSIX; externally distributed signed NSIS EXE (OV certificate); externally distributed signed MSIX; Azure Artifact Signing.

## Decision (recommended)
Distribute an NSIS installer signed with an OV code-signing certificate whose key is held in a cloud signing service or hardware token. Sign release candidates from Week 14 at the latest; choose the CA by end of Week 2. No self-signed certificates for customers. Revisit the Microsoft Store channel after v1 only if its licensing policy, data-location and tooling conditions are met.

## Alternatives considered
- **Microsoft Store MSIX:** no certificate to buy and Egypt is a supported registration market, but it needs internet, a Microsoft account and an enabled Store on shop PCs, updates on Microsoft's schedule, a certification review per release, a beta electron-builder target, an unverified fit with our offline licence, and a possible data-location problem on uninstall.
- **External signed MSIX:** same tooling risk, plus certificate trust distribution.
- **Azure Artifact Signing:** cheapest, but public-trust eligibility is limited to organizations in the USA, Canada, EU and UK and individuals in the USA and Canada; Egypt is not eligible as far as found.

## Consequences
- Yearly certificate cost (indicatively $129–440, secondary sources) and renewal about every 460 days.
- Egyptian identity validation by a CA is **unverified**; written CA answers are the next step (owner action).
- SmartScreen reputation builds gradually; early installs may still show a warning. Pilot installations before a certificate exists are done in person by the developer.
- Licensing (ADR-012), manual updates (ADR-014) and backup-before-migrate (ADR-010) stay fully under our control.

## Evidence and links
[../code-signing.md](../code-signing.md) with sources and evidence levels. Several price and SmartScreen statements are secondary or conflicting and must be re-checked before purchase.
