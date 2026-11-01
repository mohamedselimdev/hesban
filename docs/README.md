# HESBAN (حِسبان) — Planning Documents

Arabic-first, offline Windows POS / inventory / purchasing / balances / cash for small Egyptian retailers. Developed by Mohamed Selim.

Status (2026-11-01): decisions D-01…D-12 resolved (approved with conditions). Week 1 in progress: toolchain, secure Electron shell, SQLite encryption spike, migration runner, CI workflow (not yet run on GitHub) and Arabic RTL UI foundation are done; hardware, signing and accountant tasks are blocked or pending. No business modules exist yet. Executed test results are recorded only in [DEVLOG.md](DEVLOG.md).

| # | Document |
|---|---|
| A | [01-PRD.md](01-PRD.md) — Product Requirements v1.0 |
| B | [02-architecture.md](02-architecture.md) — Architecture and ADR drafts |
| C | [03-data-model.md](03-data-model.md) — Database entity model |
| D | [04-business-rules.md](04-business-rules.md) — Accounting and inventory rules |
| E | [05-threat-model.md](05-threat-model.md) — Security threat model |
| F | [06-testing-strategy.md](06-testing-strategy.md) — Testing strategy |
| G | [07-roadmap.md](07-roadmap.md) — 16-week roadmap |
| H | [08-week1-tasks.md](08-week1-tasks.md) — Week 1 checklist |
| — | [decisions.md](decisions.md) — Approved decisions, mandatory rules, conflict review |
| — | [adr/README.md](adr/README.md) — ADR index (ADR-001 to 021, one file each) and statuses |
| — | [adr/ADR-002-sqlcipher-spike.md](adr/ADR-002-sqlcipher-spike.md) — encryption spike evidence |
| — | [adr/ADR-009-renderer-ui-rtl.md](adr/ADR-009-renderer-ui-rtl.md) — Arabic RTL decisions and evidence |
| — | [visual/w1-08/](visual/w1-08/) — UI screenshots for human review |
| — | [DEVLOG.md](DEVLOG.md) — Development log (executed tests only) |

## Decision summary (details in decisions.md)

| ID | Result | Gist |
|---|---|---|
| D-01 | Approved | Double-entry, fixed chart, discounts separate (4150), net revenue reported |
| D-02 | Changed | Negative stock blocked for all roles; no estimated-cost selling |
| D-03 | Changed | No VAT calculation in prototype; check each shop's tax/ETA duties first |
| D-04 | Approved | Posting-order weighted average; backdating restricted; closed periods locked |
| D-05 | Approved | Wholesale, packaging, conversion, barcode mapping in initial schema |
| D-06 | Approved | Western digits default; Arabic-Indic optional; normalised storage |
| D-07 | Approved | One active shift per register; opening/closing count; reconciliation |
| D-08 | Approved | Extra purchase costs allocated by net line value, deterministic remainder |
| D-09 | Changed | Investigate code signing now |
| D-10 | Changed | Windows 11 x64 primary; Windows 10 conditional |
| D-11 | Approved | No automatic cash rounding |
| D-12 | Approved | Returns need original posted invoice |

Gates: accountant review before Week 4 · SQLCipher conditional · shadow mode Weeks 11–12 (not acceptance) · early real-hardware testing.
