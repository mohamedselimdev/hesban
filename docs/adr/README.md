# HESBAN — ADR Index

Full context and trade-offs for ADR-001…015 are in [../02-architecture.md](../02-architecture.md) §4. Decisions D-01…D-12 are in [../decisions.md](../decisions.md).

| ADR | Title | Status |
|---|---|---|
| 001 | Electron shell | Proposed (Electron major chosen after supported-OS check, ADR-019) |
| 002 | SQLite + SQLCipher encryption at rest ([spike evidence](ADR-002-sqlcipher-spike.md)) | **Conditionally approved** (spike done 2026-11-01; recommends `better-sqlite3-multiple-ciphers`) — spike must prove encryption, key mgmt, backup, restore, migration, performance; no hardcoded keys; failure ⇒ documented-risk review with owner |
| 003 | DB in main process, workers for heavy reads | Proposed |
| 004 | Kysely + SQL migrations | Proposed |
| 005 | Integer piastres / thousandths / BigInt | **Approved** (mandatory rule 1) |
| 006 | Internal double-entry, fixed chart, discounts separate (4150) | **Approved** (D-01) |
| 007 | Immutability, reversal documents, posting-order costing, closed-period lock | **Approved** (D-04, rule 5) |
| 008 | UUIDv7 + idempotency keys + gapless numbering | **Approved** (rule 3) |
| 009 | Renderer stack, Western digits default | Proposed (digits: Approved, D-06) |
| 010 | Encrypted backup/restore, replacement-PC recovery | **Approved** (rule 9, ADR-002) |
| 011 | Printing and scanner approach | Proposed (Week 1 spike) |
| 012 | Offline licensing; expiry never blocks data/export | **Approved** for the principle (rule 10); mechanism Proposed |
| 013 | ETA readiness, no compliance claim | **Approved** (rule 12, D-03) |
| 014 | Packaging, signing, updates | Proposed; signing investigation immediate (D-09) |
| 015 | Logging and diagnostics | Proposed |
| 016 | Negative stock prohibited | **Approved** (D-02) |
| 017 | No VAT calculation in prototype; reserve fields | **Approved** (D-03) |
| 018 | Returns only against an original posted invoice | **Approved** (D-12) |
| 019 | Windows 11 x64 primary; Windows 10 conditional | **Approved** (D-10) |
| 020 | Code-signing method selected before release preparation | **Approved** (D-09); method TBD in Week 1–2 |
| 021 | Shadow-mode pilot and release gates | **Approved** (decisions.md) |

## ADR-016 Negative stock prohibited
Context: estimated-cost selling corrupts COGS and weakens audit. Decision: every posting that would make quantity < 0 is rejected for every role including Owner, inside the posting transaction; DB CHECK `qty_milli >= 0` and `value_pt >= 0` unconditional. No setting. Consequences: shops must enter purchases/adjustments before selling; UI must show clear Arabic rejection and a path to fix (purchase/adjustment); costing never needs estimated cost; flag `below_cost` still applies to price, not stock.

## ADR-017 No VAT calculation in prototype
Decision: no tax arithmetic in V1 prototype. Reserved: line tax fields (nullable), `snapshot_json`, `uuid`, `tax_class`, outbox design. Before real-world invoicing at any pilot shop, check that shop's tax/ETA obligations. No UI or doc claims compliance.

## ADR-018 Returns policy
Decision: a sales return needs a posted original invoice line. Remaining returnable qty = sold − Σ posted returns, evaluated inside `BEGIN IMMEDIATE`. Refund per line capped at original line value; last return takes rounding remainder. Duplicate refunds prevented by `command_id` plus caps. No override path.

## ADR-019 Platform support
Decision: Windows 11 x64 primary. Windows 10 only after: confirmed security-update eligibility of the customer's installed build, Electron major's supported-OS list, and testing on real customer hardware. Windows 7/8 unsupported.

## ADR-020 Code signing
Decision: investigate methods now (OV/EV certificate, managed signing service, vendor availability for an Egypt-based individual/company, cost, hardware-token logistics, SmartScreen reputation). Choose by end of Week 2; sign release candidates from Week 14 at the latest. No self-signed certificates for customer distribution.

## ADR-021 Shadow-mode pilot and release gates
Decision: shadow mode from Weeks 11–12; HESBAN never the sole record; daily comparison with the existing system; discrepancies logged and root-caused. Shadow success is evidence, not acceptance. Release requires the gates in [../06-testing-strategy.md](../06-testing-strategy.md) §10, including accountant sign-off and rule 14.
