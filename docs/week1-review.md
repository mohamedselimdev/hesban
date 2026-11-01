# Week 1 review (W1-11)

Date: 2026-11-01 · Reviewed commit: `faef472` (merge of PR 3) plus the commit of this review.
**Verdict: CONDITIONAL.** The engineering foundation passes its checks. Three exit criteria are not met or only partly met (physical hardware, accountant engagement, enforced branch protection), and the signing decision is a recommendation, not a decision. Week 2 engineering can start; the listed gates cannot be skipped.

## 1. Evidence run for this review

Clean clone of `origin/main` at `faef472` in a temporary folder, `pnpm install --frozen-lockfile`, then:

| Check | Result |
|---|---|
| `pnpm scan:secrets`, `docs:links`, `lint`, `typecheck`, `format` | all pass |
| `pnpm test` | 10 files, 132 tests passed (133 after this review's two added assertions) |
| `pnpm test:electron` (production build, real Electron security probe) | 7 passed |
| `pnpm test:ui` (real Electron window, 5 viewports, real key events) | 12 passed |
| `pnpm verify:build -- --fuses` | OK (stock Electron copy: 7 fuse violations before, 0 after applying) |
| `pnpm audit:ci` | exit 0; 1 moderate advisory (minimatch, dev tooling only), 465 packages with verified signatures |
| Clean-clone git status | clean |
| GitHub CI on `main` HEAD `219799a` | run 41332245191 `success` |
| GitHub CI on PR heads | PR 1 `5cc759e` run 41332794234 success; PR 2 `df3defa` run 41333134070 success; PR 3 `9b145cb` run 41333486703 success. Each PR's steps were checked individually (no failed or skipped step) before merging |
| Local `main` vs `origin/main` | identical before this review branch |
| Repository visibility | private |
| Domain coverage (`pnpm test:coverage`, added by this review) | 98.79% branches, 100% lines; one unreachable defensive guard (`numeric.ts:92`) |

Limit: this is a second clean checkout on the same machine, not a second computer or a VM. Nothing ran on Windows 10, on a low-end PC, or with physical devices.

## 2. Acceptance audit (task criteria from `08-week1-tasks.md`)

| Task | Criterion | Result | Evidence / gap |
|---|---|---|---|
| W1-00 | Owner accepts; baseline tagged `docs-v1.1` | **PARTIAL** | Owner accepted the review in chat. The tag was never created. |
| W1-01 | Clean first commit, secret scan passes | **DONE** | History scan: 0 findings, 0 forbidden files (`docs/repo-prep.md`). Root commit contains old wording about tooling traces; history not rewritten by owner instruction. |
| W1-02 | Lint/typecheck/test/build pass; boundary and banned-API lint | **PARTIAL** | All commands pass. Boundary lint covers only `src/domain` (plugin dropped); `child_process`/`fs` bans outside allow-listed modules **not implemented**; no `workers/` folder yet. |
| W1-03 | Shell tests pass; verifier script | **DONE** with limits | 22 IPC/window unit tests + 7 real-Electron probe tests. Verifier runs on build output and a copy of `electron.exe`, not a packaged installer. |
| W1-04 | Driver proven on Windows with measurements and crash test | **DONE (ADR conditional)** | 500 kill iterations, 0 failures; benchmarks; backup/restore/migration tests (ADR-002 evidence). Windows 11 only; no byte-level SQLCipher interoperability check. |
| W1-05 | Migration tests incl. failure paths | **DONE** | 19 integration tests; mutation sanity checks. One real migration only. |
| W1-06 | Coverage ≥ 95% branch; ≥ 10,000 property runs; no raw arithmetic on money elsewhere | **PARTIAL → DONE for coverage** | Coverage was not measured until this review: now 98.79%. Property runs ≥ 10,000 yes. The "no raw `number` arithmetic on money outside the module" lint rule is **not implemented**. |
| W1-07 | PR shows all checks running; branch protection | **PARTIAL** | CI green on GitHub (3 PRs + main). Branch protection **unavailable** on the current plan (HTTP 403, tested). |
| W1-08 | Screenshots reviewed; formatter tests pass | **DONE** | ADR-009, `docs/visual/w1-08/`, 14 formatter/date tests, 12 UI-probe tests. Scanner prototype later completed in W1-09. |
| W1-09 | Matrix with real results | **BLOCKED** (software done) | Ports, receipt renderers, decoder, mocks, 30 tests. All physical cases BLOCKED; no device compatibility claimed. |
| W1-10 | Every Week 1 decision has an ADR | **DONE** | ADR-001…021; index with honest statuses; doc link checker in CI. |
| W1-12 | Method selected or deadline set | **CONDITIONAL** | `docs/code-signing.md` and ADR-020 recommendation (signed NSIS, OV certificate); deadline end of Week 2; no CA has confirmed Egyptian validation; nothing bought. |
| W1-13 | Accountant confirmed with a date | **NOT MET** | Checklist and 16 verified worked examples done; approval PENDING; no accountant engaged, no date. |
| W1-11 | Review, risk register, roadmap updated | **DONE** (this document) | Roadmap updated in the same change. |

Week 1 exit criteria: (1) decisions recorded as ADRs and docs consistent — met; (2) secure shell tests and verifier — met; (3) SQLite proven with measurements and crash test — met, ADR conditional; (4) migration runner tested — met; (5) Money/Qty with property tests — met; (6) CI green with branch protection — **partly** (green yes, protection no); (7) RTL/scan/print feasibility with real results or flagged blocked — RTL real, scan and print flagged BLOCKED; (8) dev log lists only executed tests — met; (9) signing chosen or deadline set, accountant engaged — **signing: deadline set; accountant: not met**.

## 3. Commits (all authored by the owner identity)

`726a7f7` baseline docs, toolchain, Money/Qty · `f61764f` W1-03 · `d096345` W1-04 · `7d5e0df` W1-05 · `ab9a2e3` W1-07 · `f47654d` W1-08 · `b9f8c53` W1-10 · `4ec8c79` repo prep notes · `72d7a55` LF line endings (fixed a real CI failure) · `219799a` CI/branch-protection record · `5cc759e` + merge `169f13e` W1-09 (PR 1) · `df3defa` + merge `202f68d` W1-12 (PR 2) · `9b145cb` + merge `faef472` W1-13 (PR 3).

## 4. Failures encountered and how they were handled

- First CI run failed at "Format check" (CRLF checkout vs Prettier LF): fixed with `.gitattributes`, commit `72d7a55`.
- Production bundle shipped the UI gallery (bracket access to an env flag): caught by the new build verifier, fixed.
- Several of my own test expectations were wrong (DST loop bound, a 10-column wrap that fits, an over-broad handler regex): tests corrected, code was right, each recorded in the DEVLOG.
- A heredoc hung one command; no state was affected.
- A return-rounding rule was ambiguous (found while writing accountant examples): clarified to the cumulative method, flagged for accountant confirmation.

## 5. Blockers

| Blocker | Owner | Needed by |
|---|---|---|
| Accountant not engaged; no review date | Owner | Before any posting code (Week 4 hard gate); engage in Week 2 |
| Physical hardware (80/58 mm printers, scanners, drawer, Windows 11 retail PC) | Owner | Printing work in Week 10; earlier is better |
| Code-signing method: CA written answers, owner's legal status | Owner | End of Week 2 |
| Branch protection not enforceable (plan) | Owner (plan/visibility decision) | Optional; mitigated by PR + CI convention |
| Windows 10 eligibility (D-10) | Owner | Before promising Windows 10 |
| Owner acceptance of ADR-002 spike limits (no reference SQLCipher check, no power-cut test) | Owner | Before Week 12 backup work |
| Pilot-shop tax/ETA obligations (D-03) | Owner | Before any real invoicing |

## 6. Unresolved risks

1. **Security: dev-only probes ship in the production bundle.** `out/main/chunks/selftest-*.js` and `uicheck-*.js` are built into the production main bundle; they are guarded by `!app.isPackaged` and environment variables but should be excluded at build time.
2. Fuses are not applied to any packaged build; only verified on a copy of `electron.exe`.
3. Renderer loads through `file://`; trust is an exact path match. A custom protocol would be stricter.
4. Sandboxing proven indirectly (no Node globals in the page); no `process.sandboxed` assertion; DevTools shortcuts not explicitly blocked.
5. One moderate dev-tooling advisory (minimatch DoS) accepted; policy fails CI on production advisories and high/critical anywhere.
6. Secret scanner is regex-based; history scan covered text diffs only.
7. CI cannot block merges (no enforced protection); self-merge is possible by design of the plan.
8. Prebuilt SQLite binary comes from the npm tarball; provenance not independently verified.
9. `safeStorage` synchronous API is deprecated in Electron 45; production must use the async API.
10. Schedule: scan threshold (35 ms), receipt widths (32/48 columns) and Arabic printing are assumptions until real devices are tested.
11. Reproducibility check used the same machine; no second computer.

## 7. Roadmap reconciliation

Planned Week 1 scope (roadmap §3) is delivered except physical hardware and the accountant/signing decisions. Extra work done that was not scheduled in Week 1: repository publication and CI hardening, build verifier and gallery gate, doc link checker, receipt/scan/print service logic (originally Week 10), hardware matrix. Hours actually spent were not tracked; velocity for the Week 4 re-baseline must be recorded from Week 2 onward.

`07-roadmap.md` is updated with the actual status and the carry-over list.

## 8. Week 2 readiness

Ready for Week 2 engineering (identity and platform) because the shell, IPC framework, encrypted database spike, migration runner and money core exist and pass in a clean clone. Not ready for anything that depends on accounting rules (Week 4) until the accountant gate clears.

### Proposed Week 2 tasks (not started)

1. Production database service: open the encrypted DB with a random key wrapped by `safeStorage` async API; close-on-failure; first-run key creation; decision on Kysely (ADR-004); DB in main process with worker skeleton (ADR-003).
2. Migration 0002: `users`, `audit_log` (hash chain), `command_log`; immutability triggers; tests including trigger abort cases.
3. Authentication: password hashing (decide scrypt vs Argon2id by measurement), PIN with persisted lockout, sessions held in the main process, recovery key at first run.
4. RBAC: permission map in code, `getActor` wired into the IPC registry, permission × role × channel matrix tests.
5. Real IPC channels for login/logout/session state; rate limiting; audit entries for every login attempt.
6. Settings service and rotating logs with scrubbing tests (ADR-015).
7. Carry-overs: exclude `selftest`/`uicheck` from production builds; add `child_process`/`fs` and raw-money-arithmetic lint rules; coverage gate in CI for `src/domain`; `afterPack` fuses hook skeleton.
8. Owner actions in parallel: engage an accountant with a review date; send written questions to certificate authorities; procure hardware; decide branch-protection approach.
