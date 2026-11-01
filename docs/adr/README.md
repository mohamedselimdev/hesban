# HESBAN — ADR Index

Each ADR is one file: status, context, decision, alternatives, consequences, evidence. Approved product decisions D-01…D-12 are in [../decisions.md](../decisions.md). The long-form proposal text is in [../02-architecture.md](../02-architecture.md) §4 (kept as background; where it differs, the ADR files win).

Status vocabulary: **Accepted/Approved** = decided; **Conditionally approved** = decided subject to named evidence; **Proposed** = recommended, not yet decided or implemented.

| ADR | Title | Status (2026-11-01) |
|---|---|---|
| [001](ADR-001-electron-shell.md) | Electron shell | Accepted (Electron 45.2.1); Windows 10 unverified |
| [002](ADR-002-sqlcipher-spike.md) | SQLite encryption at rest | **Conditionally approved**; spike done, recommends `better-sqlite3-multiple-ciphers` in SQLCipher mode |
| [003](ADR-003-db-in-main-process.md) | DB in main process, workers for heavy reads | Proposed |
| [004](ADR-004-query-layer.md) | Query layer (SQL migrations; Kysely) | Proposed; migrations implemented; Kysely deferred (decision at Week 4) |
| [005](ADR-005-money-and-quantity.md) | Integer money/quantity, BigInt | Approved, implemented |
| [006](ADR-006-double-entry-accounting.md) | Internal double-entry accounting | Approved (D-01); accountant gate before Week 4 |
| [007](ADR-007-immutability-and-costing-order.md) | Immutability, reversals, costing order | Approved (D-04) |
| [008](ADR-008-identifiers-and-idempotency.md) | Ids, idempotency, numbering | Approved |
| [009](ADR-009-renderer-ui-rtl.md) | Renderer stack, Arabic RTL, number display | Accepted for listed items; UI kit open |
| [010](ADR-010-encrypted-backup-restore.md) | Encrypted backup/restore | Approved design; prototype only |
| [011](ADR-011-printing-and-scanners.md) | Printing and scanners | Proposed; physical testing BLOCKED |
| [012](ADR-012-offline-licensing.md) | Offline licensing | Principle approved; mechanism proposed |
| [013](ADR-013-eta-readiness.md) | ETA readiness, no compliance claim | Approved |
| [014](ADR-014-packaging-signing-updates.md) | Packaging, signing, updates | Proposed |
| [015](ADR-015-logging-and-diagnostics.md) | Logging and diagnostics | Proposed |
| [016](ADR-016-negative-stock-prohibited.md) | Negative stock prohibited | Approved (D-02) |
| [017](ADR-017-no-vat-in-prototype.md) | No VAT in prototype | Approved (D-03) |
| [018](ADR-018-returns-policy.md) | Returns need original invoice | Approved (D-12) |
| [019](ADR-019-platform-support.md) | Windows 11 primary | Approved (D-10); Windows 10 checks pending |
| [020](ADR-020-code-signing-decision.md) | Code-signing method | Recommendation written (signed NSIS EXE, OV certificate); awaiting owner confirmation and CA answers |
| [021](ADR-021-shadow-mode-and-release-gates.md) | Shadow mode and release gates | Approved |
| [022](ADR-022-authentication.md) | Authentication, sessions, authorisation | Accepted for v1 (implemented; IPC wiring next) |
