# HESBAN — Development Log

Format: newest first. Each entry: what was done, decisions, tests actually executed (command + result), risks, next steps. Untested items are labelled "not tested".

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
