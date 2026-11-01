# HESBAN — 16-Week Implementation Roadmap

Status: APPROVED WITH CONDITIONS (see [decisions.md](decisions.md)) · Revised: 2026-11-01 · Capacity: 60 h/week × 16 = 960 h

## 1. Planning honesty

- 60 h/week for 16 weeks is high and sustained. Plan assumes **~50 h productive + ~10 h overhead/support/rest-of-life slack**. Treat the plan as 800 productive hours.
- Estimates carry ±30% error until Week 4 velocity is measured. At the end of Week 4 and Week 8 the roadmap is re-baselined and any scope cut is proposed for approval — scope is never silently dropped.
- Each week ends with: demo, tests run and recorded, dev-log entry, ADR updates, tagged checkpoint (no real customer data in repo).

## 2. Milestones

| Milestone | End of week | Meaning |
|---|---|---|
| M0 Approval + spikes | 1 | Decisions approved, risky technology proven (SQLite build, Arabic print, secure shell). |
| M1 Core engine | 5 | Purchase → stock → sale → COGS → journal works under invariant tests (headless). |
| M2 Internal alpha | 8 | Full sell/buy/return/pay flows through the UI. |
| M3 Feature-complete beta | 12 | Cash, reports, printing, backup/restore. |
| M4 Hardened RC | 14 | Security pass, licensing, installer, import. |
| M5 Production release gate | 16 | v1.0 released only if every gate in testing strategy §10 is evidenced; otherwise the date slips. |

## 3. Week by week

| Wk | Theme | Deliverables | Exit criteria |
|---|---|---|---|
| 1 | Foundations and spikes | Repo, toolchain, CI; secure Electron shell; SQLCipher spike on Windows 11; code-signing investigation; accountant engaged; migration runner; Money/Qty library with property tests; Arabic RTL shell + font; printing/scanner spike; ADRs finalised | Details in `08-week1-tasks.md`. |
| 2 | Identity and platform | Users, password/PIN, sessions, RBAC, audit log (hash chain), IPC handler framework, settings, first-run wizard skeleton, error-code system, logging | Permission × role matrix tests green; audit chain verifies. |
| 3 | Catalog | Units, categories, products, barcodes (multi), packagings (data), parties, Arabic FTS search with normalisation; list/edit UIs; archive rules | 50k-product dataset search < 150 ms; CRUD + permission tests. |
| 4 | Inventory and purchasing core | `stock_movements`, `stock_balances`, weighted-average engine, opening stock, purchase invoice post (draft/post), journal posting engine + chart of accounts, invariant checker v1, immutability triggers | **Hard gate before any posting code: accountant review of `04-business-rules.md` complete.** Property tests INV-A…INV-J pass; purchase UI first cut. **Re-baseline.** |
| 5 | Sales core | Sales invoice post with COGS, numbering, idempotency (command_log), payments + allocations (at-sale), credit sale, credit-limit check | Crash-injection harness green on sale; M1 reached. |
| 6 | POS UI | Cart, barcode wedge handling, quantity/discount, payment dialog, hold/resume, keyboard shortcuts, change calc, below-cost/override permission flows | Scan-to-line p95 < 150 ms; cashier flow usable keyboard-only. |
| 7 | Returns and corrections | Sales return, purchase return, invoice cancel/reversal, stock adjustments (with reasons/limits) | Round-trip/reversal properties green; golden scenarios 1–15 pass. |
| 8 | Party payments and balances | Customer receipts, supplier payments, allocation (FIFO/manual), statements, aging, opening balances, `party_balances`/`invoice_balances` | INV-E/F pass; **M2 alpha demo**; **Re-baseline #2 + scope review.** |
| 9 | Cash management | Shifts, drawer movements, expenses, owner drawings/capital, over/short, Z-report, day close/lock | INV-G pass; day-close lock test (post into closed date rejected). |
| 10 | Printing and hardware | Receipt templates 80/58 mm, reprint "نسخة", statement/Z printing, cash-drawer kick, scanner robustness (Arabic layout), printer settings | Receipts verified on ≥ 3 real printers; matrix results recorded. |
| 11 | Reports and export | Sales/profit/inventory/low-stock/cash/expense/aging reports (worker, read-only), CSV/XLSX export with injection guard, full data export, stocktake (Should) | Report totals match golden fixture to the piastre. |
| 12 | Backup, restore, integrity | Encrypted backup scheduler, retention, verification, restore wizard, safety backup, integrity-check UI, diagnostics bundle | Replacement-PC restore drill passes; tamper tests green. **Shadow mode starts** (beside the shop's existing system; HESBAN never the sole record). **M3.** |
| 13 | Security hardening | Threat-model walkthrough, fuse/CSP verifier on packaged build, IPC fuzzing, dependency audit/SBOM, audit-log viewer, idle lock, password policy, pen-test checklist | Security suite green on installer; findings fixed or accepted in writing. |
| 14 | Licensing, installer, import | Licence verify + state machine + read-only mode, separate issuer tool, NSIS installer, signing (method chosen by end of Week 2, D-09), first-run wizard complete, CSV import (dry-run), upgrade/migration-with-backup test | Expired-licence export/backup/restore test passes; clean install + upgrade on fresh VMs. **M4.** |
| 15 | Pilot and acceptance | Continue shadow mode at pilot shop with daily comparison against the existing system, UAT scripts, fix list, performance on real low-end PC, training material (short Arabic guide/videos plan) | Daily integrity check clean; S1/S2 = 0. |
| 16 | Stabilise and release | Bug fixing, hardening, docs (install, backup, recovery, support runbook), release candidate, licence issuance process, v1.0 tag, handover/ops checklist | Release gates in testing strategy §10 evidenced; gates are not waived — if any fails, release slips. **M5.** |

Note: shadow mode (from Weeks 11–12) compares HESBAN with the shop's existing system and is never the sole financial record. A 30-day shadow run is evidence, not production acceptance. If gates are not met in Week 16, the release date moves; features are cut (§4) before accounting, security or recovery testing is reduced.

## 3a. Actual status (updated 2026-11-01, end of Week 1)

| Wk | Planned | Actual | Carry-over |
|---|---|---|---|
| 1 | Foundations and spikes | **CONDITIONAL** (see [week1-review.md](week1-review.md)). Done: toolchain, secure Electron shell, encrypted SQLite spike (ADR-002 conditional), migration runner, Money/Qty core (98.79% branch coverage), CI green on GitHub, Arabic RTL foundation with real-window checks, ADR-001…021, hardware ports/mocks, signing and accountant documents. Not met: physical hardware (BLOCKED), accountant engaged (PENDING), enforced branch protection (unavailable on plan), signing decision (recommendation only). | Hardware tests; accountant engagement; CA answers by end of Week 2; lint rules for `fs`/`child_process`/raw money arithmetic; exclude dev probes from production bundle; fuses in a packaged build; coverage gate in CI. |
| 2 | Identity and platform | Not started (waits for the review to be accepted). Proposed tasks are listed in the review. | — |

Unscheduled work done in Week 1 that moves later weeks earlier: repository and CI, build verifier, doc link checker, receipt/scan/print service logic and mocks (originally Week 10). Physical printing work in Week 10 still needs real devices.

## 4. Scope-cut order (if behind; each requires approval)

1. CAT-07 CSV import → manual entry only + documented template.
2. INV-04 stocktake session (keep plain adjustments).
3. PRN-04 A4 invoice/statement PDF.
4. CAT-04 packaging UI (keep data model).
5. SAL-09 wholesale tier.
6. AUTH-05 idle lock (keep logout).
7. PUR-04 extra costs allocation.
Never cut: atomicity, idempotency, immutability, backups/restore, integrity checker, permission checks, export-when-expired.

## 5. Dependencies and critical path

Critical path: Week 1 spikes → Week 2 platform → Week 4 costing/journal → Week 5 sales → Week 7 returns → Week 12 backup → Week 14 licensing/installer.
External lead times to start now: Windows 11 retail PC and printers/scanner/drawer purchase, code-signing investigation (method by Week 2), Egyptian accountant engagement (review before Week 4), per-shop tax/ETA obligation check before any real-world invoicing, pilot-shop agreement, accountant review of business rules, Arabic font licence check, logo asset for "Developed by Mohamed Selim" About credit.

## 6. Effort allocation (approx.)

Domain + data + tests ~35%, UI ~30%, hardware/printing ~7%, backup/security ~12%, licensing/installer ~6%, docs/ops/pilot ~10%.

## 7. Governance

- Change control: any change to v1 scope, accounting rules or ADRs is a written proposal with impact on schedule/risk; implemented only after approval.
- Weekly review checklist: tests executed and recorded · invariants green · docs updated · no tool-specific files or local paths in tracked files · no secrets in repo · checkpoint committed to the private repository.
