# HESBAN — Testing Strategy

Status: APPROVED WITH CONDITIONS (see [decisions.md](decisions.md)) · Revised: 2026-11-01

Rule zero: **a test that has not been executed has not passed.** Reports, the dev log and release notes list only results from actual runs, with the command, date and commit.

## 1. Objectives

1. Prove financial and stock correctness with machine-checked invariants, not just examples.
2. Prove durability (crash/power loss) and recoverability (backup/restore).
3. Prove security controls remain in force on the packaged build.
4. Prove the real shop workflows work with real hardware in Arabic.

## 2. Test layers

| Layer | Scope | Tools | Run |
|---|---|---|---|
| L1 Unit (pure domain) | Money/qty arithmetic, rounding, costing, discount allocation, posting rules, permission matrix | Vitest | Every commit; < 10 s |
| L2 Property-based | Algebraic laws and invariants over random inputs | fast-check (inside Vitest) | Every commit (bounded runs), nightly (large runs) |
| L3 Integration (DB) | Use cases against a real temporary SQLite DB with real migrations, triggers and constraints | Vitest + better-sqlite3 | Every commit |
| L4 Contract/IPC | Schema validation, permission × role matrix, error codes, handler enumeration | Vitest | Every commit |
| L5 Security | Fuses, CSP, window options, injection corpora, tamper tests, dependency audit | Vitest scripts, custom checks, `pnpm audit`/OSV | Every commit (fast subset), release (full) |
| L6 E2E | Real packaged Electron app driving Arabic UI flows | Playwright (`_electron`) | Nightly + before release |
| L7 Crash/durability | Kill the process mid-transaction at randomised points; power-loss simulation on VM | Custom harness | Nightly + release |
| L8 Performance | Scan-to-line, posting, reports on 50k products / 1M lines | Benchmarks (tinybench/custom), recorded baselines | Weekly + release |
| L9 Hardware/manual | Printers, scanners, cash drawer, low-end PCs, Windows 11 (Windows 10 only if D-10 passes) | Checklist with signed results | Per milestone |
| L10 Acceptance (UAT) | Pilot-shop scripted scenarios in Arabic | Checklists + observation | Weeks 15–16 |

Target proportions: most tests at L1–L3 (fast, deterministic). E2E limited to critical journeys.

## 3. Financial correctness tests (core)

### 3.1 Example-based golden scenarios
A scenarios file (`tests/fixtures/scenarios/*.yaml`) describes a sequence of business events and the **hand-computed** expected results: stock qty/value per product, COGS per sale, journal entries, party balances, cash expected. The runner replays each scenario through the real use cases on a fresh DB and compares exact integers. Scenarios are authored from §10 of the business rules and reviewed by the owner (and, ideally, an accountant) *before* code is written (test-first for rules).

### 3.2 Property-based invariants (fast-check)
Generate random sequences of valid commands (purchase, sale, return, payment, adjustment, reversal, expense, cash in/out, shift close) with random quantities/prices, then assert after **every** command:
- INV-A … INV-L from the business rules.
- Money conservation: Σ(cash received) − Σ(cash paid) = Δ cash accounts.
- Idempotency: replaying any command with the same `command_id` changes nothing.
- Commutativity/associativity where expected (e.g. splitting a purchase into two lines vs one yields same total value; allocation of discount sums exactly).
- Round-trip: sale then full return restores stock qty and value exactly to prior state.
- Reversal: command followed by its reversal yields original balances (with extra ledger rows).
- Monotonic numbering without gaps.
- Stock qty and value never negative for any role; over-sale attempts are rejected with zero side effects (D-02).
- Σ returned qty per sale line ≤ sold qty; Σ refunds ≤ original line value; repeated return commands never double-refund (D-12).
- Discount separation: 4100 − 4150 − 4200 equals net sales for every random history (D-01).
- Digit normalisation: Arabic-Indic, Persian and Western digit input give identical stored integers (D-06).
Shrinking provides a minimal failing sequence which becomes a permanent regression scenario.

### 3.3 Mutation testing
Stryker on `domain/` (money, costing, allocation, posting). Target: mutation score ≥ 85% on money/costing modules. Surviving mutants are triaged, not ignored.

### 3.4 Integrity checker as a test oracle
The shipped integrity tool runs after every integration test scenario and every property test run. The product feature and the test oracle are the same code, so it is exercised constantly.

### 3.5 Overflow and precision
Boundary tests at 2^53, max invoice amount, qty × price products exceeding 2^53 (BigInt path), negative zero, rounding at ±0.5 piastre boundaries, qty 0.001.

## 4. Database tests

- Migrations: apply from empty; from every previous released schema version (fixtures with realistic data) to latest; checksum tamper ⇒ startup refused; migration failure ⇒ rollback and DB unchanged.
- Triggers: attempt UPDATE/DELETE on every protected table ⇒ ABORT; allowed status transitions only.
- Constraints: CHECKs reject negative stock (unconditional, D-02), unbalanced journal, duplicate barcodes, duplicate command ids.
- Concurrency: two app instances ⇒ second refuses; `BEGIN IMMEDIATE` contention; reader (worker) does not block writer under WAL.
- Durability: kill -9 at random points during posting (hundreds of iterations) ⇒ after restart integrity check passes and either whole or no document exists; `PRAGMA integrity_check` ok.
- Performance of indexes: `EXPLAIN QUERY PLAN` assertions for the hot queries (barcode lookup, product search, party statement).
- Encryption (ADR-002): wrong key refused; no key in source/logs/config (secret-scan test); key unwrap failure path; migration on an encrypted DB; backup/restore of an encrypted DB; benchmark versus plain.

## 5. Backup / restore tests

- Round-trip: backup → restore into new location → integrity checker + checksum of logical content equals original.
- Tamper: flip a bit in header/body ⇒ restore refuses with a clear message.
- Wrong passphrase ⇒ refuse; no partial state.
- Restore older backup ⇒ lost-document summary correct; pre-restore safety backup created.
- Schema-older backup ⇒ migrates after restore.
- Interrupted restore (kill during swap) ⇒ original DB intact or recoverable via safety copy.
- Scheduled backup under active use (WAL checkpoint behaviour) ⇒ consistent snapshot.
- **Replacement-PC recovery drill** (rule 9): fresh Windows 11 machine and a different Windows user, no access to the original DPAPI-wrapped key; restore from backup file with passphrase or recovery key; integrity checker clean; documented in the dev log. Repeat before each release candidate and quarterly in operation.

## 6. Security tests (details of plan in threat model §7)

- Packaged-build verifier script asserts: fuse flags, ASAR integrity on, `webPreferences` values, CSP header, no devtools, no `remote`, no extra preload exposure (enumerate `window.hesban` API surface, snapshot test).
- IPC: for every registered channel × role ⇒ expected allow/deny; malformed payload corpus (wrong types, oversized, prototype keys) ⇒ rejected with code and audited.
- Injection corpora (SQL, HTML/JS, CSV formula, path traversal, Unicode bidi/zero-width, RTL override characters) through every text field, import, search, and receipt render.
- Auth: lockout/back-off persisted across restart; timing-safe compare; no secrets in logs (log-scrubbing test greps captured logs).
- Dependency: lockfile audit, license allow-list, banned-API lint (`eval`, `child_process` outside allow-listed module, `dangerouslySetInnerHTML`).
- Licence: forged/modified/expired/clock-rolled-back licence cases; expired ⇒ export/backup/restore still work (explicit test).

## 7. UI and E2E tests

- Implemented so far (W1-03, W1-08): real-Electron probes launched by Vitest (`pnpm test:electron` security probe, `pnpm test:ui` layout/keyboard probe with screenshots); Playwright remains the plan for full journeys.
- Playwright driving the real Electron build; Arabic strings asserted; RTL layout assertions (computed `direction`, logical alignment) and screenshot comparisons on key screens.
- Critical journeys: first-run setup → add product → purchase → sale by barcode → partial payment → return → shift close → day close → backup → restore → export.
- Keyboard-only POS flow; scanner simulation (rapid key events with correct inter-key timing, Arabic layout active).
- Accessibility smoke (axe-core) on main screens.
- Visual regression limited to receipts and key screens, with deliberate approval of changes.

## 8. Performance tests

Budgets from PRD §5. Synthetic dataset generator (50k products, 20k parties, 1M lines). Benchmarks recorded as JSON per commit in CI artifacts; regression > 20% fails the weekly run. Run on a reference low-end machine (physical) before each milestone — CI VM numbers are indicative only.

## 9. Hardware and environment matrix

| Item | Minimum matrix |
|---|---|
| OS | Windows 11 x64 (clean VM + real retail PC) primary. Windows 10 only after D-10 checks pass (update eligibility, Electron support, customer hardware). |
| PC | Low-end (Celeron/4 GB/HDD) and mid-range (i3+/8 GB/SSD) |
| Thermal printers | At least 3 common models, 80 mm and 58 mm, USB (e.g. the models actually used by the pilot shop) |
| Scanners | 2 USB keyboard-wedge models; test with Arabic and English layouts |
| Cash drawer | 1 RJ11 printer-driven drawer |
| Display | 1366×768 and 1920×1080; 100% and 125% scaling |
| Locale | Arabic (Egypt) Windows and English Windows with Arabic keyboard |

## 10. Acceptance criteria (release gate for v1.0)

All must be true and evidenced:
1. 100% of Must requirements have at least one passing automated test or a signed manual test record.
2. All golden scenarios and property suites pass; integrity checker clean on every pilot DB at close of each pilot day.
3. 0 open Sev-1/Sev-2 defects; Sev-3 documented with workarounds.
4. Crash test: ≥ 1,000 randomised kill iterations with 0 integrity failures.
5. Restore drill from backup on a second machine succeeded.
6. Security verification (§6) green on the **packaged** installer.
7. Performance budgets met on the reference low-end machine.
8. Shadow mode (from Weeks 11–12; HESBAN never the sole record): daily comparison with the shop's existing system, all differences explained and fixed or accepted in writing; integrity checker clean each day; Z-report reconciles with physical cash within recorded over/short. Shadow mode — including a 30-day run — is supporting evidence and does **not** replace gates 1–7 and 9–12.
9. Expired-licence export/backup/restore test passed; no data deleted or export blocked on expiry (rule 10).
10. Egyptian accountant sign-off on purchasing, valuation, sales, partial payments, returns, discounts, rounding and journal mappings.
11. Replacement-PC recovery drill passed (§5).
12. No unresolved critical financial, security or data-loss defect (rule 14). Gates are not waived to hit the 16-week target.

## 11. CI/CD

- GitHub Actions on `windows-latest`: install (lockfile frozen) → lint → typecheck → L1–L5 → build → packaged-build security verifier → upload artifacts. Nightly: L2 large runs, L6, L7, L8, mutation (domain).
- Branch protection: tests green before merge to main; tagged releases built only from green main.
- Test data contains **no real customer data**; generators produce synthetic Arabic names.

## 12. Defect management and definition of done

Severity: **S1** data loss/corruption or wrong money; **S2** feature blocked / security flaw; **S3** workaround exists; **S4** cosmetic. S1 stops the line.
Definition of Done for any task: code + tests at the right layer, lint/typecheck clean, docs/ADR updated if a decision changed, dev-log entry listing commands actually run and results, no AI/vendor-tool traces in tracked files.

## 13. Reporting

Each week-end dev-log entry includes: tests run (count, pass/fail, commands), coverage of domain (line/branch), mutation score trend, open defects, perf numbers, and what was **not** tested. Coverage targets: domain ≥ 95% branch, application ≥ 85%, overall tracked but not a goal by itself.
