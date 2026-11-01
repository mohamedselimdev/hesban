# HESBAN — Development Log

Format: newest first. Each entry: what was done, decisions, tests actually executed (command + result), risks, next steps. Untested items are labelled "not tested".

## 2026-11-01 — W2-04 IPC authentication wiring, main-process database, sign-in screens

Done (branch `w2-04-ipc-auth-wiring`)
- IPC contract extended to 14 channels (auth status/setup/login/PIN login/logout/change-password, users list/create/reset-password/set-role/deactivate, audit verify) with strict request and response schemas (no key can leak: responses are schema-checked). Registry: `requireLogin`, sender window id, `onDenied` hook; refusals are audited as `permission.denied` with the actor id and channel.
- Main process now opens the encrypted database in the user-data folder at start (DPAPI key via async safeStorage), creates sessions/auth service, registers all handlers, closes the DB on quit. Startup failure shows an Arabic error box with a stable code only. Sessions are bound to the window id and ended when it closes; role change, reset and deactivation revoke the user's sessions.
- Default pre-migration safety copy (encrypted file copy after WAL checkpoint, newest 3 kept) until the real backup module exists.
- Preload exposes frozen groups `system`, `auth`, `users`, `audit` only. Minimal Arabic first-run setup (with one-time recovery key screen), login and signed-in screens.
- `selftest` probe now runs the whole flow over the real IPC.

Tests executed (2026-11-01)
- typecheck, lint, format, docs:links, scan:secrets clean. `pnpm test`: 213 passed (198 + 15 new: IPC authorisation matrix, window-bound sessions, session revocation, last owner through IPC, malformed payloads, hash/recovery leakage check, lockout over IPC, safety-copy retention, new preload surface). Coverage gate 98.82% branches (src/domain).
- `pnpm test:electron` (real Electron, real DPAPI, real encrypted DB): 9 passed, including the full flow: status before setup, UNAUTHENTICATED without login, setup + recovery key, owner creates cashier, wrong login, PIN login, cashier FORBIDDEN on create/list/audit, audit chain verifies.
- `pnpm test:ui` 12 passed; `verify:build -- --fuses` OK; packaged build verified (`verify:packaged` OK) and the packaged app was started for 12 s: it created `hesban.db` (header not plain SQLite) and `db.key.enc` in its user-data folder, so the native SQLite module loads from the unpacked asar and DPAPI works in the packaged build.

My own mistakes this task (reported): a failed shell heredoc left a partial state (corrected by rewriting the file), the scanner flagged fake probe passwords (moved into named constants), a regex lost its backslashes through shell quoting (fixed), an off-by-one expectation on audit row counts.

Not proven
- No UI automation of the new screens (only IPC-level and flow-level checks); the sign-in screens have not been screenshot-reviewed. Concurrent windows, idle expiry in the running app, and low-end-PC login time are untested. Recovery-key reset and PIN login have no UI yet. DPAPI portability to another Windows user is untested.

## 2026-11-01 — W2-03 Authentication, sessions, RBAC (service layer; IPC wiring is W2-04)

Done (branch `w2-03-auth-rbac`; ADR-022)
- `src/domain/permissions.ts`: 26 permissions, 3 roles, matrix mirroring business-rules §8. `src/application/auth/`: password and PIN policy, lockout schedule, in-memory session store (idle 15 min sliding, hard limit 12 h, keyed by window id, revocation per user). `src/infrastructure/security/password-hasher.ts`: scrypt (passwords N=2^17, PINs N=2^15; measured here 270 ms / 70 ms), self-describing hash string, constant-time verify, refuses malformed/oversized parameters, rehash on weaker parameters. `src/infrastructure/auth/auth-service.ts`: first-owner setup with one-time recovery key, password and PIN login, DB-persisted lockout, uniform behaviour for unknown users, user create/role/deactivate/reset, own-password change, recovery-key reset with persisted lockout, audit entries in the same transaction.
- Scanner change: the generic `secret-assignment` rule no longer applies under `tests/` (fake test passwords); token shapes, private keys and hex key literals are still checked there (tested).

Tests executed (2026-11-01)
- typecheck, lint, format, docs:links, scan:secrets clean. `pnpm test`: 15 files, 198 passed (156 + 42 new: permission matrix against an independent hand-written copy, policies, lockout, sessions, hasher with real parameters and malicious stored values, 23 auth-service integration tests incl. forged-role refusal, lockout persistence across restart, unknown-user parity, audit contents, last-owner protection, recovery key). Coverage gate: 98.82% branches on src/domain (now includes permissions.ts).

My own test mistakes (code was right): two arithmetic errors in a session-expiry test; test passwords that contained the username were (correctly) rejected by the policy, fixture passwords changed.

Not proven
- Login time on a low-end PC; concurrent logins; UI. Not wired into Electron yet: the main process does not open the database or register auth channels (W2-04). Infrastructure auth code is not under the coverage gate (gate covers src/domain only).

## 2026-11-01 — W2-02 Database service, key store, identity/audit schema

Done (branch `w2-02-db-service`)
- `src/infrastructure/db/key-store.ts`: random 256-bit key created on first run only, stored wrapped (DPAPI in the app via `src/main/safe-storage.ts`, async `safeStorage` API) with durable temp-file + rename; never creates a new key beside an existing database (`KEY_MISSING_FOR_EXISTING_DATABASE`); unreadable/damaged key → `KEY_UNREADABLE` with no key material in the message; honours `shouldReEncrypt`.
- `src/infrastructure/db/database-service.ts`: `openAppDatabase` (unwrap/create key, open encrypted DB, migrate, backup hook before changing an existing DB, close on any failure, WAL truncate on close).
- Migration `0002_identity_audit.sql`: `users` (roles, case-insensitive unique usernames, no delete, last-active-owner trigger), `audit_log` (immutable, DB-enforced chain link to previous hash), `command_log` (unique command id, immutable).
- `src/infrastructure/db/audit-log.ts`: `appendAudit` (SHA-256 chain over canonical JSON, same transaction as the action) and `verifyAuditChain`.
- ADR-004: Kysely deferred to the Week 4 re-baseline (plain prepared statements with typed rows).

Tests executed (2026-11-01)
- `pnpm typecheck`, `lint`, `format` clean. `pnpm test`: 12 files, 156 tests passed (133 + 23 new: key store, DB service, identity triggers, audit chain incl. tamper detection with triggers dropped, rollback together with the action, command log).
- `pnpm test:electron` (real Electron, probe build): 8 passed, including the new check that the real DPAPI-wrapped key opens the real encrypted database, reopen applies no migration, key file does not contain the plain key, DB header is not plain SQLite.

Not proven
- DPAPI key portability to another Windows user/PC is not tested (expected to fail; recovery is the backup path, Week 12). The audit chain detects tampering after the fact; it does not prevent someone with the key from rebuilding the whole chain. Main process does not open the DB yet (wiring comes with auth, W2-04).

## 2026-11-01 — W2-01 Week 1 carry-overs (Week 2 started; owner accepted the Week 1 review)

Done (branch `w2-01-carryovers`)
- Test probes (`selftest`, `uicheck`) are compiled only when `HESBAN_DEV_PROBES=1` (build-time constant `__DEV_PROBES__`). Tests build their own probe variants (`out-probe`, `out-ui`); `out/` is production only. `verify-build` now fails if any probe chunk or probe string is in `out/main` (proved by building a probe variant into `out/`: verifier failed with 4 findings; production build passes).
- Lint: `child_process`, `fs`, `worker_threads`, `net`, `http(s)` imports banned outside `src/infrastructure`, `src/main` and tooling; casts `as Piastres` / `as Milli` banned outside `money.ts`/`qty.ts`. Proved with a deliberate violation file (3 errors reported, file removed).
- CI: coverage gate (95% branches/lines/functions/statements on `src/domain`; measured 98.79% branches), real-Electron probe on the probe build, production build, build verifier, **packaged-build verification**.
- `electron-builder.yml` + `pnpm package:dir` + `tools/verify-packaged.mjs`: unsigned `release/win-unpacked` build with Electron Fuses applied by electron-builder (runAsNode off, node options/inspect off, cookie encryption on, ASAR integrity validation on, only load from ASAR, no file-protocol privileges). Verified on the real packaged `HESBAN.exe`: 0 fuse violations (stock Electron had 7); `app.asar` has 283 entries, none from src/tests/docs/tools/probes; `win32-x64.node` unpacked beside the asar. The packaged app started and stayed alive for 8 seconds (asar integrity accepted).

Tests executed (2026-11-01)
- scan:secrets, docs:links, lint, typecheck, format OK; `pnpm test` 133 passed; coverage gate pass (98.79% branches); `test:electron` 7 passed; `test:ui` 12 passed; `verify:build -- --fuses` OK; `package:dir` + `verify:packaged` OK. Not yet run on GitHub at time of writing (see PR).

Resolved from the Week 1 review: risk 1 (probes in production bundle), risk 2 (fuses only on a copy), carry-over lint rules, coverage gate.
Still open: signing (no certificate; packaged build is unsigned), `react`/`react-dom`/`@fontsource/cairo` are runtime `dependencies` although Vite bundles them (they add to the packaged node_modules; move to devDependencies in a later task), installer (NSIS) not built, Windows 10 untested.

## 2026-11-01 — W1-11 Week 1 review (verdict CONDITIONAL)

Done (branch `w1-11-week1-review`)
- `docs/week1-review.md`: acceptance audit of every Week 1 task against its criteria, commit list, failures, blockers, unresolved risks, roadmap reconciliation, Week 2 proposal. Roadmap §3a and docs index updated.
- Clean-clone run of `origin/main` at faef472 (same machine, not a second computer): scan:secrets, docs:links, lint, typecheck, format OK; `pnpm test` 132 passed; `test:electron` 7 passed; `test:ui` 12 passed; `verify:build -- --fuses` OK; `audit:ci` exit 0 (1 moderate dev-tooling advisory); clean git status.
- Added `@vitest/coverage-v8` 5.0.5 (new dev dependency, no upgrades) and `pnpm test:coverage`: first measurement of domain coverage was 95.18% branch overall but qty.ts 83.33% and money.ts 92.85% (below the W1-06 per-file criterion). Added assertions for negative quantity formatting and `neg` on non-zero values: now 98.79% branch, 100% lines; `numeric.ts:92` is an unreachable defensive guard. `pnpm test`: 10 files, 133 tests passed.

New finding
- `selftest` and `uicheck` chunks are present in the production main bundle (`out/main/chunks`). Guarded by `!app.isPackaged` plus env vars, but they should be excluded from production builds (Week 2 carry-over).

## 2026-11-01 — W1-13 Accountant review checklist (external approval PENDING)

Done (branch `w1-13-accountant-checklist`)
- `docs/accountant-review-checklist.md`: 11 sections, 50+ questions covering journals, costing, purchases, extra costs, sales discounts, returns, receivables/payables, opening balances, cash reconciliation, expenses, rounding and boundaries; every response and the sign-off table are marked PENDING. No accountant has reviewed anything; the document says so.
- `tests/unit/accountant-examples.test.ts`: 16 tests that compute every worked example in the checklist with the real domain functions (discount allocation, weighted average, sale discount, returns, payment allocation, cash over/short, balanced journals).
- Specification defect found while writing examples: the return rule "the last return takes the remainder" was ambiguous and gives different per-return amounts than a cumulative method. Rules §5.3/§5.4 now state the cumulative method (refund and restored cost = round(total × cumulative returned qty / original qty) − amount already refunded) and the checklist asks the accountant to confirm it (question 5.2).

Tests executed (2026-11-01)
- `pnpm test`: 10 files, 132 tests passed (116 + 16); typecheck, lint, format, docs:links, scan:secrets clean. The 16 example tests passed on first run (hand calculations matched the code).

Open
- Accountant not yet engaged; Week 4 posting work stays blocked until sign-off.

## 2026-11-01 — W1-12 Code signing and distribution investigation

Done (branch `w1-12-code-signing`; no purchase, nothing published)
- `docs/code-signing.md`: comparison of Microsoft Store MSIX, external signed NSIS EXE (OV), external signed MSIX and Azure Artifact Signing on cost, Egypt eligibility, installer experience, updates, licensing compatibility, data safety and tooling; every claim tagged official / secondary / unverified, with sources.
- ADR-020 rewritten as a recommendation: signed NSIS installer with an OV certificate (key in cloud signing or hardware token). ADR-014 and ADR index updated.

Key findings (from web searches on 2026-11-01)
- Azure Artifact Signing public trust: organizations in USA/Canada/EU/UK, individuals USA/Canada only (Microsoft quickstart) — Egypt not eligible as far as found.
- Microsoft Store: Egypt listed as a supported developer-account market (older fee table: 133 EGP individual); free individual registration announced 2025-09-10 but applicability to Egypt not confirmed.
- OV/EV private keys must be in certified hardware or cloud signing since 2023 (vendor sources); validity now about 460 days; prices indicative $129–440/year from reseller pages.
- electron-builder MSIX target is beta; Store policy on offline/external licensing and MSIX data location on uninstall are NOT verified.

Tests executed
- `pnpm docs:links` OK, `pnpm scan:secrets` OK (documentation-only change; no code tests affected).

Open
- No CA has confirmed Egyptian identity validation (owner action, written questions listed in the document). Owner's legal status (individual vs registered business) unknown. Recommendation awaits owner confirmation.

## 2026-11-01 — W1-09 Hardware abstractions and mocks (physical testing BLOCKED)

Verified before starting: HEAD `219799a` — CI run 41332245191 completed with conclusion `success`; local `main` and `origin/main` both `219799a74f7c…`; repository is private.

Done (branch `w1-09-hardware-abstractions`)
- Ports `src/application/ports/hardware.ts` (Printer, CashDrawer, BarcodeScanner, HardwareError with retryable codes; every descriptor carries `isMock` and `verifiedOnPhysicalHardware: false`).
- Receipt model, plain-text renderer (wraps by grapheme to 32/48 columns, isolates numbers, strips bidi overrides) and HTML renderer (escapes, no script, CSP `default-src 'none'`), `src/application/receipt/`.
- Scan decoder (physical `code`, inter-key gap, min/max length, terminators, GTIN check) and wedge scanner over a `KeySource`, `src/application/hardware/`.
- `printReceipt` / `openDrawer` (never throw for hardware faults; retry only TIMEOUT/DEVICE_BUSY; failure leaves the document reprintable).
- Mocks `src/infrastructure/hardware/mocks.ts`. `docs/hardware-matrix.md`: every device and case BLOCKED; "Supported models: none".
- Moved `format.ts` to `src/shared/format.ts` so main-process receipt code can use it (imports updated; behaviour unchanged).

Tests executed (2026-11-01)
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm docs:links`, `pnpm scan:secrets` clean. `pnpm test`: 9 files, 116 tests passed (86 + 30 new). `pnpm test:electron` and `pnpm test:ui` rerun after the move; build verifier OK.
- Two of my own new tests failed on first run because the expectations were wrong (a 10-column line that legitimately fits; a regex that flagged harmless escaped text `onerror=`). Fixed the tests; the code was correct.

Not proven / BLOCKED
- No real printer, scanner, drawer or retail PC was used. Nothing here shows Arabic shaping, cutting speed, scan timing (35 ms threshold is an assumption) or drawer pulse works on any device.
- No Electron adapter for the Windows print driver exists yet; HTML output has not been printed.
- Receipt column widths (32/48) are typical values, not measured.

## 2026-11-01 — Repository published (private) and first CI runs

Done (owner approved creation and push)
- Created private repo `mohamedselimdev/hesban` (verified `isPrivate: true`), pushed `main`.
- Run 41331812995 (commit 4ec8c79): **FAILED** at "Format check". Cause: the Windows runner checks files out with CRLF while Prettier expects LF (51 files flagged). Fixed by adding `.gitattributes` (`* text=auto eol=lf`, binary rules for png/woff) in commit 72d7a55.
- Run 41331953035 (commit 72d7a55): **PASSED**, 1m44s. Every step green: install, secret scan, doc links, lint, typecheck, format, tests, Electron security probe, Arabic RTL UI check (real window on the runner), build verifier with fuses, dependency audit, SBOM, SBOM upload.

Branch protection (probed with the real API, 2026-11-01)
- `PUT /branches/main/protection`, `GET /rulesets` and `GET /branches/main/protection` all returned HTTP 403: "Upgrade to GitHub Pro or make this repository public to enable this feature." Enforced protection and rulesets are NOT available for this private repository on the current plan. No settings were changed.
- Consequence: CI runs on every push but cannot block merges. Use pull requests and green CI by convention until the owner decides on a plan change or visibility change (not done, nothing purchased).

Notes
- The first push included the root commit wording noted in `docs/repo-prep.md` (history not rewritten, per no instruction to rewrite).
- The pushed history is now public to GitHub's servers (private repo); rewriting later would need a force-push.

## 2026-11-01 — W1-10 ADRs finalised, documents reconciled

Done
- 19 new ADR files `docs/adr/ADR-001…021` (002 and 009 are the existing evidence files); each has status, context, decision, alternatives, consequences, evidence. `docs/adr/README.md` is now an index with real statuses (Approved / Conditionally approved / Proposed). No ADR is marked verified where evidence does not exist (ADR-011 hardware BLOCKED; ADR-019 Windows 10 unverified; ADR-020 method not chosen).
- Inconsistencies fixed: architecture doc said i18n was undecided (now: minimal typed dictionary) and Kysely was the decision (now: undecided, migrations done); decisions.md and PRD still listed the SQLCipher spike as outstanding; docs/README status was out of date; testing strategy did not mention the real-Electron probes.
- New tool `tools/check-doc-links.ts` (`pnpm docs:links`, CI step, unit test) fails on broken relative Markdown links.

Tests executed (2026-11-01)
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm scan:secrets` clean. `pnpm test`: 8 files, 86 tests passed (84 + 2 link-checker tests). `pnpm docs:links`: OK.

Open
- `docs/code-signing.md` is referenced as "not yet written" (W1-12). Hardware ADR-011 stays Proposed.

## 2026-11-01 — W1-08 Arabic RTL, typography, numbers, keyboard, responsive

Done
- Cairo (OFL-1.1) bundled via `@fontsource/cairo` 5.3.0; logical-property CSS (`src/renderer/styles/`); `ui/Money.tsx`, `ui/DataGrid.tsx` (roving tabindex, direction-aware arrows); `i18n/format.ts` (grouping, digit styles, Cairo dates, UTC offset helper); `i18n/ar.ts` typed dictionary; gallery page `spike/Gallery.tsx` (build-time flag `VITE_GALLERY=1`); dev-only probe `src/main/uicheck.ts`; configurable output folder (`HESBAN_OUT_DIR`) in `electron.vite.config.ts`.
- Details and decisions: `docs/adr/ADR-009-renderer-ui-rtl.md`. Screenshots: `docs/visual/w1-08/`.

Tests executed (2026-11-01)
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm scan:secrets`: clean. `pnpm test`: 7 files, 84 tests passed (65 earlier + 14 formatting/date/dictionary + 5 secret scanner). `pnpm test:electron`: 7 passed. `pnpm test:ui`: 12 passed (real Electron, 5 viewports, real key events). `pnpm verify:build -- --fuses`: OK.

Defects found and fixed during the task (reported, not hidden)
- First UI run: gallery did not render because the app read the URL hash only once; fixed with a `hashchange` subscription.
- `electron-vite build --outDir` moved only main/preload (renderer went to `src/renderer/out-ui`); replaced by a `HESBAN_OUT_DIR` config variable. Stray folders deleted.
- My own test bug: a loop bound in the DST-window test was one day short; corrected (code was right).
- **Production bundle shipped the gallery chunk.** `import.meta.env['VITE_GALLERY']` (bracket access) is not replaced at build time, so the lazy chunk was emitted. Caught by the new `verify-build` check; fixed by using `import.meta.env.VITE_GALLERY`. Production build now has no gallery chunk or markup.
- One screenshot assertion failed once because the screenshot call was never added (edit did not apply); fixed and rerun.

Findings / open
- Amount columns align to the end edge (left in RTL). Needs owner confirmation with a pilot user.
- The Arabic strings dictionary is bundled whole (gallery labels included) because object properties are not tree-shaken; harmless but noted.
- The `pnpm test:ui` CI step has not run on GitHub (no remote yet); it needs a desktop session on the runner.
- Not tested: >125% scaling, IME, screen readers, pixel-diff regression.

## 2026-11-01 — W1-07 CI (workflow written and every step run locally; NOT yet run on GitHub)

Done
- `.github/workflows/ci.yml`: windows-latest, `permissions: contents: read`, concurrency cancel, 25 min timeout. Actions pinned to commit SHAs (checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.0, upload-artifact v7.0.2; SHAs resolved from the upstream tags on 2026-11-01). Steps: frozen-lockfile install, secret scan, lint, typecheck, format, tests, production build + real Electron probe, build verifier with fuses, dependency audit, SBOM (CycloneDX) uploaded as artifact.
- `tools/scan-secrets.ts` (own scanner, no third-party action): known token shapes, private keys, secret/key assignments, 64-hex key literals; refuses tracked `.db/.key/.pem/.pfx/.hbk/.env*`; `secret-scan:allow` marker; unit tests in `tests/security/secret-scan.test.ts`.
- `package.json`: `packageManager` pnpm@12.16.1, scripts `scan:secrets`, `audit:ci`, `sbom:generate`. `tsconfig.json`: `allowImportingTsExtensions`, `erasableSyntaxOnly`, includes `tools/*.ts`.

Run locally on 2026-11-01 (same commands as the workflow)
- `pnpm scan:secrets` OK (69 text files); planted fake key assignment in an untracked file → FAILED as intended; force-added `leak.db` → FAILED as intended; both removed, clean again.
- `pnpm lint`, `pnpm typecheck`, `pnpm format` clean. `pnpm test`: 6 files, 70 tests passed. `pnpm test:electron`: 7 passed. `pnpm verify:build -- --fuses`: OK. `pnpm audit:ci`: exit 0. `pnpm run sbom:generate`: 417 KB CycloneDX file produced (git-ignored).

Findings
- `pnpm audit` reports 1 moderate advisory (minimatch DoS, GHSA-g3hv-75wg-m249) reachable only through dev tooling (eslint, electron-builder), not shipped code. `audit:ci` fails on any `--prod` advisory and on high/critical anywhere; this moderate is accepted for now and must be re-checked when tooling updates.
- `pnpm audit signatures`: 465 packages with verified registry signatures.
- `pnpm sbom` is a built-in command, so the script is named `sbom:generate`.

Not done / not verified
- No GitHub remote exists, so the workflow has never executed on GitHub and branch protection is not set. `actionlint` is not installed; YAML only passed Prettier parsing.
- Fuses are still verified on a copy of electron.exe, not on a packaged installer.
- The secret scanner is regex-based and weaker than gitleaks; it does not scan git history (a fresh repository has one local history only).
- Branch protection command for later (after the private repo exists): `gh api -X PUT repos/<owner>/<repo>/branches/main/protection` with required status check `verify`, required PR reviews as chosen, force-push and deletion disabled.

## 2026-11-01 — W1-05 Migration runner

Done
- `src/infrastructure/db/open.ts` (SQLCipher-mode open, strict 64-hex key check before the PRAGMA, handle closed on any failure, key verified at open), `migrations/runner.ts`, `migrations/load.ts` (SQL embedded at build time via `import.meta.glob`), `migrations/sql/0001_init.sql` (`app_meta`, `settings`; `schema_migrations` is created by the runner).
- Rules: forward-only; versions 1..n without gaps; all pending migrations run in ONE `BEGIN IMMEDIATE` transaction (all-or-nothing); refuses newer-than-app schema, changed checksum (CRLF-normalised) and `user_version` mismatch; `beforeMigrate` backup hook runs only for an existing DB with pending work and aborts everything if it throws (real backup arrives Week 12).
- `better-sqlite3-multiple-ciphers` 13.0.3 added as runtime dependency (exact pin). `tsconfig.json` maps its types via `paths` because the package `exports` has no `types` entry.

Tests executed
- `pnpm typecheck`, `pnpm lint`, `pnpm format`: clean. `pnpm test`: 5 files, 65 tests passed (46 earlier + 19 migration integration tests, incl. encrypted DB, wrong key not leaving the file locked, malformed-key rejection, upgrade from every earlier version, rollback, backup-hook abort).
- Mutation sanity check (manual, reverted): disabling the checksum check fails 1 test; removing the single transaction fails 12 tests.
- `pnpm build` and `pnpm test:electron` (7 tests) still pass; the Electron main does not use the DB yet.

Not tested / risks
- Only one migration exists, so "every released version" is simulated with prefixes of synthetic migrations.
- Migration SQL containing its own BEGIN/COMMIT (other than trigger bodies) would break the single-transaction guarantee; no guard yet.
- Native module packaging (`asarUnpack`, electron-builder) not tested.
- Large-database migration time and disk-full behaviour not tested.

## 2026-11-01 — W1-04 SQLCipher / encryption spike

Done
- Spike code in `tools/spikes/sqlite/` (not shipped; excluded from lint/format). Evidence and recommendation: `docs/adr/ADR-002-sqlcipher-spike.md`.
- Candidates: `better-sqlite3-multiple-ciphers` 13.0.3 (MIT) viable; `@signalapp/sqlcipher` rejected (AGPL-3.0); `@journeyapps/sqlcipher` rejected (npm blocks win32).

Tests executed (2026-11-01, Windows 11, Node 24.12.0, Electron 45.2.1)
- Load on Node ABI 137 and Electron ABI 150: OK without a compiler (prebuilt `.node` ships in the npm tarball; no MSVC on this machine).
- Encryption: header not plain, marker absent from `.db`/WAL, wrong/no key rejected, rekey works. Identical on both ABIs.
- `safeStorage` (DPAPI) key wrap: OK; sync API deprecated in Electron 45, async API works.
- Backup container (scrypt + AES-256-GCM carrying the DB key): restore with passphrase only OK; wrong passphrase, 4 bit-flip positions and truncation all rejected; migrations idempotent, tamper detected, failure rolls back.
- Benchmarks (1M rows): posting p95 1.67 ms plain vs 2.25 ms encrypted; barcode p95 0.013 vs 0.029 ms; bulk insert 15.5 s vs 30.3 s.
- Crash test: 500 kill iterations, 0 integrity failures.
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (46 passed) still clean.

Not proven
- Byte-level SQLCipher 4 interoperability (no reference tool); power-loss durability (process kill only); low-end hardware numbers; binary provenance; CI build on clean image.
- Bug found in spike: a failed `open()` (wrong key) leaked the DB handle and locked the file on Windows; production `open` must close on failure.

## 2026-11-01 — W1-03 Secure Electron shell

Done
- Electron 45.2.1, electron-vite 6.0.0, Vite 8.3.5, React 19, @electron/fuses 2.1.3. pnpm build script allowed only for `electron` (`pnpm-workspace.yaml`); `electron-winstaller` denied.
- Main: `src/main/index.ts`, `security.ts`, `csp.ts`, `ipc/registry.ts`, `ipc/handlers.ts`, `selftest.ts` (dev/test only, refused when packaged). Preload: `src/preload/api.ts`, `index.ts`. Contract: `src/shared/contracts/ipc.ts`. Renderer: `src/renderer/*`. Tools: `tools/fuses.mjs`, `tools/verify-build.mjs`.
- Enforced: contextIsolation, sandbox, nodeIntegration off, webSecurity, no webview, devTools off when packaged, strict production CSP (meta tag), closed zod-validated channel list, sender URL + main-frame check, permission check in registry, response schema check, navigation/window-open/webview blocks, all permissions denied, single-instance lock.

Tests executed (2026-11-01)
- `pnpm typecheck`, `pnpm lint`, `pnpm format`: clean.
- `pnpm test`: 4 files, 46 tests passed (24 existing Money/Qty + 22 new security unit tests).
- `pnpm test:electron` (production build + real Electron process): 1 file, 7 tests passed. Raw probe: no require/process/module/ipcRenderer in page; only frozen `hesban.system.ping`; IPC round trip ok; eval and inline script blocked by CSP; window.open null; navigation to https://example.com blocked; one window; geolocation denied; notifications denied.
- `node tools/verify-build.mjs --fuses`: OK. Stock Electron copy had 7 fuse violations; after applying `tools/fuses.mjs` 0.

Findings / risks
- Fuses verified on a temp copy of electron.exe only; NOT yet applied in a packaged build (needs electron-builder afterPack hook, W1-07/Week 14).
- Renderer loads via file://; trust is the exact index.html path. A custom app:// protocol would be stricter; consider in Week 13.
- DevTools disabled only via webPreferences when packaged; menu removed; no explicit shortcut block.
- Sandbox confirmed indirectly (no Node globals in page); no direct `process.sandboxed` assertion.
- Dev-mode CSP allows unsafe-inline (Vite HMR); production CSP has none. `electron-vite dev` not exercised.
- Not tested: packaged installer, ASAR integrity, Windows 10.

## 2026-11-01 — Week 1 start: W1-01, W1-02 (partial), W1-06

Done
- W1-01: git repo (branch `main`), `.gitignore`, `.editorconfig`, `LICENSE`, `README.md`; tool-specific folders excluded via `.git/info/exclude`. Files staged, not committed.
- W1-02 (partial): Node 24.12.0, pnpm 12.16.1, TypeScript 6.0.3 (7.0.2 rejected: typescript-eslint 8.72.1 does not support it), ESLint 10, Prettier, Vitest 5, fast-check, zod. Strict tsconfig. Domain purity lint rule and banned-syntax rules. **Not done:** electron-vite scaffold (moves to W1-03).
- W1-06: `src/domain/numeric.ts`, `digits.ts`, `money.ts`, `qty.ts` — BigInt `mulDivRound`, largest-remainder `allocateByWeight`, EGP/qty parse and format, digit normalisation.

Tests executed (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format`, all on 2026-11-01)
- typecheck: clean. lint: clean. format: clean.
- vitest: 2 files, 24 tests passed (includes property tests at 10,000 runs for mulDivRound reference model, allocate sum/sign, parse/format round-trip).
- Not measured: coverage percentage, mutation score (tooling not yet added).

Risks
- Money in domain is branded `number` (safe integers) with BigInt only inside multiply/divide and sums; overflow throws `NumericError`.

## 2026-11-01 — Decisions approved; documents reconciled (no application code)

Done
- Recorded D-01…D-12 and additional conditions in `docs/decisions.md`; ADR index and ADR-016…021 in `docs/adr/README.md`.
- Updated docs 01–08 and README for consistency (10 conflicts resolved, listed in decisions.md).
- Week 1 checklist rebalanced to 60 h; added W1-12 (code signing) and W1-13 (accountant).

Tests
- None executed (documentation only). Verification: grep for stale terms (`DRAFT FOR REVIEW`, `Windows 10 22H2`, `negative-stock policy`, `[D-0`, `[DECISION`, `Owner may enable`, `Pilot go-live`) returned only the conflict-review table text.

Risks
- Accountant review is a hard gate before Week 4. Return-journal mapping with discounts (4150/4200) and extra-cost eligibility need accountant confirmation.
- SQLCipher and Windows 10 eligibility unresolved until spikes/checks.

Next
- Owner accepts consistency review (W1-00), then start Week 1.

## 2026-11-01 — Planning phase (no application code)

Done
- Drafted planning deliverables: PRD v1.0, architecture proposal with ADR drafts, data model, accounting/inventory rules, threat model, testing strategy, 16-week roadmap, Week 1 task list.
- Collected open decisions D-01…D-12 for owner approval (see README).

Decisions
- None approved yet. All ADRs are "Proposed".

Tests
- None executed. No code exists. Nothing is claimed to pass.

Risks raised
- 960 h capacity assumption; Arabic thermal printing; native SQLite packaging; code-signing lead time; pilot duration vs release date.

Next
- Owner reviews documents and answers D-01…D-12; on approval, start Week 1 (docs/08-week1-tasks.md).
