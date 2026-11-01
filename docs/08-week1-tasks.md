# HESBAN — Week 1 Detailed Tasks

Status: WEEK 1 REVIEW DONE — verdict CONDITIONAL; per-task results and gaps are in [week1-review.md](week1-review.md). This file keeps the original plan; it is not a status report.
Capacity: ~55 h planned + ~5 h buffer. Work week suggestion: Saturday–Thursday, 6 days.

Theme: **prove the risky things, set the quality bar, write no business logic yet** (except the numeric core, which everything depends on).

## Pre-requisites (before Day 1)

| Item | Owner | Needed for |
|---|---|---|
| Decisions D-01…D-12 — DONE 2026-11-01 ([decisions.md](decisions.md)) | Product owner | Rules, schema |
| Real Egyptian retail hardware: thermal printer(s) (80 and 58 mm), USB barcode scanner, cash drawer, Windows 11 retail PC | Product owner | W1-04, W1-09 |
| Windows 11 x64 VM for clean-install tests (Windows 10 only if D-10 checks pass) | Product owner | W1-04, W1-07 |
| Shortlist of Egyptian accountants | Product owner | W1-13 |
| Private GitHub repository created, branch protection to be set in W1-07 | Product owner | W1-01 |
| Decision on code-signing path started (lead time) | Product owner | Week 14 |

## Task list

### W1-00 Consistency review sign-off — 1 h
- Read `docs/decisions.md` conflict review; confirm no stale text remains (grep checks recorded in the dev log).
- Output: baseline tagged `docs-v1.1`.
- Done when: owner accepts the documents; Week 1 may start.

### W1-01 Repository and hygiene — 3 h
- `git init`, private remote, `.gitignore` (node_modules, dist, release, *.db, *.sqlite*, *.key, .env*, logs, backups), `.editorconfig`, `LICENSE` (proprietary notice), `README.md`.
- Tool-specific/ephemeral folders go in `.git/info/exclude`, not tracked files.
- Commit identity = the developer's own; no tool attribution anywhere.
- Done when: clean first commit; secret scan (gitleaks or equivalent) passes.

### W1-02 Toolchain and project scaffold — 4 h
- Pin Node LTS (`.nvmrc` + `engines`), pnpm via corepack, TypeScript `strict` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint (typescript-eslint, boundaries plugin, no-floating-promises), Prettier, Vitest, `electron-vite` scaffold with React.
- Folder layout per architecture §3; module-boundary lint rules enforced (domain cannot import infrastructure/electron).
- Banned-API lint: `eval`, `new Function`, `dangerouslySetInnerHTML`, `child_process`/`fs` outside allow-listed modules.
- Done when: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass locally (command output recorded in the dev log).

### W1-03 Secure Electron shell baseline — 7 h
- Main process: single-instance lock; one `BrowserWindow` with `contextIsolation`, `sandbox`, `nodeIntegration:false`; CSP; deny `window.open`, block navigation, deny permission requests; DevTools only in dev.
- Preload: exposes `window.hesban` with exactly one method (`system.ping`) via `contextBridge`.
- IPC: `defineHandler({channel, schema, permission, handler})` wrapper with zod validation, sender-frame check, `Result` envelope, correlation id. Registry enumerable for tests.
- Electron Fuses configured in build (SEC-02).
- Tests: window-options assertions; handler enumeration test; malformed payload corpus ⇒ rejected; renderer cannot access `require`/`process`.
- Done when: tests pass; a script `tools/verify-build.ts` reads the packaged app and asserts fuses + options (initially against the unpacked dev build).

### W1-04 SQLCipher and encryption spike — 9 h
- Build and run on Windows 11 under Electron: `better-sqlite3-multiple-ciphers` (SQLCipher mode) and a true SQLCipher build, with plain `better-sqlite3` as the baseline; record exact versions, prebuilt-binary availability, rebuild steps, installer size impact. Test: encryption, key management (no hardcoded keys; secret scan), backup, restore, migration on an encrypted DB, performance. If SQLCipher fails: list alternatives and security risk; owner decides before any unencrypted fallback.
- Verify pragmas (WAL, `synchronous=FULL`, foreign keys, STRICT, `trusted_schema=OFF`); extension loading disabled.
- Key handling prototype: random 256-bit key, wrap/unwrap with `safeStorage`; open encrypted DB; wrong key fails.
- Benchmarks: insert 1M `stock_movements`-like rows in transactions; 20-line "posting-like" transaction latency; barcode lookup on 50k products; encrypted vs plain overhead.
- Crash test: child process begins a transaction, is killed at random points ×500; reopen; `integrity_check` + atomicity asserts.
- Output: ADR-002 updated with decision and numbers; spike code kept under `tools/spikes/` (not shipped).
- Done when: decision recorded with measured evidence; if cipher variant fails, fallback documented.

### W1-05 Migration runner — 4 h
- Numbered `.sql` migrations, checksum table, single transaction per migration, forward-only, refuses on checksum mismatch or newer-than-app schema; hook for pre-migration backup (stub in W1, real in W12).
- Migration `0001_init`: `app_meta`, `schema_migrations`, `settings`.
- Tests: apply from empty; idempotent re-run; tampered checksum ⇒ refuse; failing migration ⇒ DB unchanged.
- Done when: tests green.

### W1-06 Numeric core: Money and Qty — 8 h
- `src/domain/money.ts`, `qty.ts`: branded integer types; BigInt-based `mulDiv(a, b, c)` with round-half-away-from-zero; parse/format of EGP and quantities (no floats); percent-to-piastres; largest-remainder `allocate(total, weights)`.
- Unit tests for every function with boundary cases (±0.5 piastre, 2^53+, negative zero, qty 0.001, fractional kg price example 0.350 × 85.50).
- Property tests: `allocate` sums exactly to total and is non-negative for non-negative weights; `mulDiv` matches an independent BigInt reference model; parse∘format round-trips.
- Lint rule/test: no `number` arithmetic on branded money outside this module.
- Done when: coverage on these files ≥ 95% branch; property runs ≥ 10,000 cases; results recorded.

### W1-07 CI and branch protection — 4 h
- GitHub Actions on `windows-latest`: frozen-lockfile install, lint, typecheck, unit/property tests, build, build-verifier script; cache pnpm store.
- Dependency audit step (`pnpm audit`) and secret scan; SBOM generation placeholder.
- Branch protection on `main`: PR + green checks required.
- Done when: a pull request shows all checks executing and passing (or failing for a real reason that is fixed).

### W1-08 Arabic RTL and typography spike — 4 h
- Bundle one Arabic-capable font locally (licence verified); `dir="rtl"`, `lang="ar-EG"`; layout built with logical CSS properties.
- Page with: RTL form, table with numeric columns (decide alignment for amounts), mixed Arabic/Latin/numeric strings (bidi isolation with `<bdi>`/`unicode-bidi`), digit style toggle (Western default vs Arabic-Indic display) plus input normalisation of Arabic-Indic/Persian digits to ASCII (D-06), `Intl.NumberFormat('ar-EG', {currency:'EGP'})` vs custom formatter on integer piastres, date formatting `Africa/Cairo` including a DST boundary test (documented dates, verified at test time).
- Keyboard-wedge scanner prototype: detect rapid keystrokes via `KeyboardEvent.code` with Arabic layout active; unit test with simulated events.
- Decide i18n mechanism (`i18next` vs minimal typed dictionary) and record in ADR-009.
- Done when: screenshots of the spike page reviewed; formatter tests pass.

### W1-09 Printing and hardware spike — 6 h (blocked without hardware)
- HTML receipt (Arabic, RTL, mixed numerals, barcode/QR placeholder) printed silently via a hidden `BrowserWindow` to each available printer at 80 mm and 58 mm.
- Check: shaping correctness, line wrap, cut, margins, speed; try raster fallback; try ESC/POS cash-drawer pulse.
- Run on the Windows 11 retail PC with the real scanner and cash drawer. Record per-device results (model, driver, paper width, pass/fail, notes) in `docs/hardware-matrix.md`; list supported and unsupported models.
- Done when: matrix started with real results; if no hardware, task marked **Blocked** (not "done") and carried to Week 2 with the risk raised.

### W1-10 Documentation and decision records — 3 h
- Move approved docs into the repo, split `docs/adr/README.md` entries into `docs/adr/ADR-001…021.md` files with final status, create `docs/DEVLOG.md` entries, `docs/hardware-matrix.md`, threat-model v0 reference.
- Done when: every Week-1 decision has an ADR with context/decision/consequences.

### W1-11 Week review and demo — 3 h
- Demo: secure shell running, encrypted DB open/close, migration test, Money library tests, Arabic page, print result.
- Re-run all checks from a clean clone on a second machine/VM (proves reproducibility).
- Update risk register and roadmap; list anything not tested.
- Done when: dev-log entry complete with exact commands run and outcomes; Week 2 plan confirmed.

### W1-12 Code-signing and distribution investigation — 3 h
- Compare: OV certificate, EV certificate, managed signing service; eligibility for an Egypt-based developer/company, price, lead time, hardware-token or cloud-HSM logistics, SmartScreen reputation behaviour, CI integration, key custody.
- Output: ADR-020 with a chosen method (or a dated decision deadline no later than end of Week 2) and an installer distribution plan (download host, hash publication).
- Done when: method selected or procurement started with an owner-approved fallback.

### W1-13 Accountant engagement — 1 h
- Choose a qualified Egyptian accountant; send `04-business-rules.md` and `decisions.md`; agree review scope (purchasing, inventory valuation, sales, partial payments, returns, discounts, rounding, journal mappings) and a date before Week 4.
- Output: engagement confirmed, review date recorded in the dev log. Findings become change requests to doc 04.
- Done when: accountant confirmed with a date; otherwise raise as a schedule risk (posting code cannot start).

## Time summary

| Task | h |
|---|---|
| W1-00 | 1 |
| W1-01 | 3 |
| W1-02 | 4 |
| W1-03 | 7 |
| W1-04 | 9 |
| W1-05 | 4 |
| W1-06 | 8 |
| W1-07 | 4 |
| W1-08 | 4 |
| W1-09 | 6 |
| W1-10 | 3 |
| W1-11 | 3 |
| W1-12 | 3 |
| W1-13 | 1 |
| **Total** | **60** (no slack: if W1-09 is blocked, its 6 h become buffer) |

## Suggested daily order

- Day 1: W1-00, W1-01, W1-02, W1-13
- Day 2: W1-03, start W1-04
- Day 3: finish W1-04, W1-05
- Day 4: W1-06
- Day 5: W1-07, W1-08, W1-12
- Day 6: W1-09, W1-10, W1-11

## Week 1 exit criteria

1. Approved decisions recorded as ADRs; all documents consistent (no stale negative-stock, Windows 10, VAT or 30-day-pilot-as-acceptance text).
2. Secure shell tests pass; fuses/options verifier script exists.
3. SQLite driver choice proven on Windows with measurements and a crash test.
4. Migration runner tested, including failure paths.
5. Money/Qty library with property tests passing.
6. CI green on Windows with branch protection.
7. Arabic RTL/scan/print feasibility documented with real results or flagged as blocked.
8. Dev log lists only executed tests and their real results.
9. Signing method chosen (or deadline set); accountant engaged with a review date before Week 4.
