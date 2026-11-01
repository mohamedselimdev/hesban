# HESBAN — Development Log

Format: newest first. Each entry: what was done, decisions, tests actually executed (command + result), risks, next steps. Untested items are labelled "not tested".

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
