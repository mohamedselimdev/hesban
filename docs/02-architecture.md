# HESBAN — Architecture Proposal

Status: APPROVED WITH CONDITIONS (see [decisions.md](decisions.md), [adr/README.md](adr/README.md)) · Revised: 2026-11-01

## 1. Quality attributes, in priority order

1. **Correctness** of money and stock.
2. **Durability and recoverability** of data.
3. **Security** (local threats: insiders, theft, malware-lite, tampering).
4. **Operability by non-experts** (Arabic UX, speed at the counter).
5. **Maintainability** by one developer.
6. Performance (adequate on low-end hardware; not a tuning contest).

When two goals conflict, the higher one wins. Example: we accept slightly slower posting to keep everything in one durable transaction.

## 2. Style: modular monolith, layered, ports-and-adapters

One Electron application, one SQLite file, one deployable. Inside: strict module boundaries enforced by lint rules (`eslint-plugin-boundaries` or `dependency-cruiser`).

```
 Renderer (React, sandboxed, no Node)
      │  typed API via preload (contextBridge) — only whitelisted channels
 Preload (tiny, no logic)
      │  ipcRenderer.invoke(channel, payload)
 Main process
   ├─ IPC layer: validate (zod) → authenticate session → authorize permission → call use case
   ├─ Application layer: commands/queries, transaction scripts, idempotency
   ├─ Domain layer: PURE TypeScript (money, qty, costing, posting rules, invariants) — no I/O
   └─ Infrastructure: SQLite repos, migrations, backup, printing, license, logging, OS integration
      │
 Worker thread (read-only SQLite connection): heavy reports, exports, integrity check, backup verification
```

Dependency rule: `renderer → contracts`; `ipc → application → domain`; `infrastructure → application ports`. Domain imports nothing from outside itself. This makes the financial core testable without Electron or SQLite.

## 3. Repository layout (proposed)

```
hesban/
  docs/                    PRD, architecture, ADRs, rules, threat model, dev log
  src/
    shared/contracts/      zod schemas + TS types for every IPC call (used by both sides)
    domain/                money.ts qty.ts costing.ts posting/ rules/ errors.ts
    application/           commands/ queries/ ports/ services/
    infrastructure/
      db/                  connection.ts migrations/ repositories/ triggers/
      backup/ license/ printing/ logging/ security/
    main/                  app bootstrap, windows, ipc handlers, fuses config
    preload/               index.ts (bridge only)
    renderer/              features/{pos,catalog,purchasing,...} ui/ i18n/ styles/
    workers/               reports.worker.ts integrity.worker.ts
  tests/                   unit/ integration/ property/ security/ e2e/ fixtures/
  tools/                   license-issuer/ (separate private tool), scripts
```

The license issuing tool (holds the private signing key) is a **separate private project**, never shipped, never in this repository's tracked history.

## 4. Key technology decisions (ADRs; authoritative statuses in [adr/README.md](adr/README.md))

Each shows options, trade-offs, recommendation. The Week-1 spikes may change a recommendation; the change is then recorded in the dev log.

### ADR-001 Desktop shell: Electron
- Alternatives: Tauri (small, Rust backend), .NET WinUI/WPF (native printing, best Windows fit), local web server + browser.
- Trade-offs: Electron is heavy (~150–250 MB install, higher RAM) but gives one language (TypeScript) end to end, strong RTL/Arabic text rendering (Chromium), a large ecosystem, and matches the developer's skills. Tauri would need Rust for the DB/domain layer and WebView2 print behaviour is less proven. .NET is arguably the best fit for POS hardware, but is a different language/stack from the developer's preference.
- Decision: **Electron** (pin a currently supported stable major; upgrade policy: security patch releases within 30 days). Primary target Windows 11 x64; Windows 10 only after the D-10 checks (security-update eligibility, the chosen Electron major's supported-OS list, real customer hardware). See ADR-019.

### ADR-002 SQLite driver and encryption at rest
- Options: (a) `better-sqlite3` (synchronous, fast, simple transactions; no encryption); (b) `better-sqlite3-multiple-ciphers` (same API, SQLCipher-style encryption); (c) `node:sqlite` built-in (experimental status, avoid for financial core); (d) `sql.js` WASM (in-memory, durability risk, no).
- Trade-offs: native module must be rebuilt/prebuilt for Electron's ABI (packaging risk). Encryption adds small CPU cost and a key-management burden. Without DB encryption, a stolen/copied `.db` exposes all business data.
- Decision (conditionally approved): **SQLCipher-compatible encryption.** Week-1 spike must test encryption, key management, backup, restore, migration and performance on Windows 11, and evaluate both `better-sqlite3-multiple-ciphers` (SQLCipher mode) and a true SQLCipher build. Never hardcode keys. If it fails, evaluate alternatives and document the security risk; switching to unencrypted SQLite requires an explicit owner decision recorded in an ADR. Encrypted backups are mandatory in every case.
- Key management: random 256-bit database key generated at install, wrapped with Electron `safeStorage` (Windows DPAPI, tied to the Windows user). Because DPAPI-wrapped keys die with the Windows profile, backups are encrypted separately with a key derived from an owner-held passphrase/recovery key (see ADR-010). No key ever lives in source or logs.

### ADR-003 Where SQLite runs: main process, short transactions, workers for heavy reads
- Options: all in main; separate utility process for DB; renderer direct (rejected: security).
- Trade-off: synchronous `better-sqlite3` blocks the event loop; with short indexed OLTP transactions (< 50 ms) that is acceptable and removes a whole class of concurrency bugs. Reports, exports, integrity check and backup verification run in worker threads using a separate **read-only** connection (WAL allows concurrent readers).
- Decision: main-process writer (single connection, single writer by construction) + worker readers.

### ADR-004 Query layer: Kysely over hand-written SQL migrations
- Alternatives: raw SQL strings, Drizzle, Prisma (heavy engine binaries, poor fit), TypeORM.
- Trade-off: financial SQL (aggregations, locking behaviour) is better explicit than hidden behind an ORM; Kysely gives typed queries without hiding SQL. Migrations are plain numbered `.sql` files with checksum validation, applied forward-only inside a transaction, preceded by an automatic pre-migration backup.
- Decision: custom minimal migration runner (implemented in W1-05, all pending migrations in one transaction). Kysely adoption is a Week 2 gate and is not yet decided (see adr/ADR-004).

### ADR-005 Money and quantity representation
- Money: integer **piastres** (`INTEGER`, 64-bit in SQLite). Never floats. JS arithmetic that multiplies then divides (value × qty ÷ onHand) uses **BigInt**, because intermediate products can exceed 2^53.
- Quantity: integer **thousandths** of the base unit (`qty_milli`), supporting 3 decimals.
- Costing precision: inventory is tracked as total *value* in piastres plus quantity; unit average cost is derived, not stored as truth (see business rules §4). This avoids sub-piastre drift.
- Decision: a single `Money` / `Qty` domain module with property-based tests is the only place arithmetic and rounding live. Lint forbids `number` arithmetic on money elsewhere.

### ADR-006 Accounting model: lean internal double-entry
- Options: (A) operational ledgers only (stock movements, cash movements, party ledger); (B) full user-visible double-entry accounting; (C) **internal double-entry journal driven by a posting engine, fixed chart of accounts, hidden from the shop owner in v1.**
- Trade-offs: (A) is simplest but has no independent cross-check — a bug in a report is undetectable. (B) is overkill and confusing for shopkeepers. (C) adds ~1–1.5 weeks of work and a posting-rules table, but gives balanced-entry guarantees, a trial-balance integrity test, a P&L source of truth, and a path to accountant exports and tax compliance.
- Decision: **(C)**, approved (D-01). Discounts are journaled separately (contra account 4150) and reports show net revenue. Operational ledgers (stock, cash, party) remain the operational truth; the journal is generated in the same transaction and reconciled by invariant checks.

### ADR-007 Document lifecycle and immutability
- Lifecycle: `draft → posted → (reversed)`. Posted documents are immutable. Corrections are counter-documents (returns, reversals, adjustments).
- Enforcement is layered: (1) domain rules; (2) SQLite triggers that `RAISE(ABORT)` on UPDATE/DELETE of posted document rows, ledger tables and journal tables; (3) the integrity checker. Triggers protect against bugs and casual tampering; they are not a defence against someone with file-system write access (see threat model).
- Costing order is **posting order** (sequence), not business-date order.

### ADR-008 Identifiers and idempotency
- Internal PK: `INTEGER PRIMARY KEY` (fast, compact). Every business document additionally has `uuid` (UUIDv7, unique) for external reference, ETA payloads and any future sync.
- Idempotency: the renderer generates a `command_id` (UUID) when the user starts a transaction (opening a cart/payment dialog). The `command_log` table has a unique constraint on it. A retry with the same id returns the stored result and posts nothing. Required for every state-changing financial command.
- Document numbers: gapless per series, allocated **inside** the posting transaction from a counter row; a rollback also rolls back the counter, so no gaps from failures.

### ADR-009 Renderer stack
- React + TypeScript + Vite via `electron-vite`; TanStack Query for IPC data fetching/caching; Zustand for POS cart/UI state; React Hook Form + zod for forms; TanStack Table + virtualisation for grids.
- UI kit: own thin design system on Radix UI primitives with CSS logical properties (`margin-inline-start`, etc.) so RTL is native rather than patched. Alternatives: MUI (RTL works but heavy, look not tuned for POS), Ant Design (good RTL, very heavy, opinionated). Bundled local Arabic font (e.g. Cairo or Tajawal, licence-checked); no CDN anywhere.
- i18n: externalised strings from day one; decided in W1-08: a minimal typed dictionary (`src/renderer/i18n/ar.ts`), not `i18next` (ADR-009); numerals configurable; `Intl` with `ar-EG` and `Africa/Cairo`.

### ADR-010 Backup and restore
- Backup = SQLite online backup API / `VACUUM INTO` into a temp file, then encrypt (AES-256-GCM) with a key derived by a memory-hard KDF (scrypt or Argon2id) from a backup passphrase, write with a header (format version, app version, schema version, created-at, shop id, SHA-256 of plaintext), `fsync`, re-open and verify by decrypting and running `PRAGMA integrity_check` + the invariant checker (on a temp copy).
- Retention: keep N daily + M weekly (configurable), never delete the newest verified backup.
- Restore: verify → show backup date and the number of documents that would be lost → take a "pre-restore safety backup" of the current DB → swap file atomically → run migrations if older → run invariant checker → report. Restore never silently overwrites.
- The recovery key is shown once at setup; losing both the passphrase and recovery key means the backups are unrecoverable — stated plainly in the UI.

### ADR-011 Printing and hardware
- Baseline: render receipt as HTML/CSS in a hidden `BrowserWindow`, print silently to the selected Windows printer through its driver (Chromium handles Arabic shaping and bidi correctly). Alternative: raw ESC/POS (needs code-page + manual shaping; Arabic is error-prone) — used only for the cash-drawer pulse and, if needed, for sending a rasterised receipt image.
- Barcode scanners: keyboard-wedge. Detect a scan by inter-key timing (< ~30 ms) plus Enter/terminator; read `KeyboardEvent.code` (physical key) rather than `key` so scans are correct even when the Arabic layout is active.
- Print is **not** part of the financial transaction: a printer failure never rolls back a posted invoice; reprint is always available and marked "نسخة".
- Hardware compatibility list is a deliverable; test with the real printers before promising support.

### ADR-012 Licensing (offline)
- Ed25519-signed JSON license (shop id, machine binding hash, plan id, valid-from/until, grace days, feature flags). Public key embedded; private key only in the separate issuer tool.
- Machine binding: hash of stable identifiers (Windows MachineGuid + volume serial), tolerant to one change; re-issue on hardware change by the vendor.
- Behaviour: license state machine `active → grace → read_only`. Read-only keeps view/report/export/backup/restore. Last-seen-time monotonic check is a deterrent only.
- Honest limit: any client-side licensing can be bypassed by a determined attacker; goal is honest-customer compliance, not DRM.

### ADR-013 ETA readiness (no compliance claim)
- Design now: immutable document snapshot (canonical JSON) written at posting; per-line tax fields (nullable, unused in v1); `external_submissions` outbox table reserved (not created until implemented); document UUIDs; Arabic/English item names; item-code fields reserved.
- Prohibited: any UI text, marketing or doc stating "ETA compliant" before an implemented, tested and verified integration exists against the then-current ETA specification.

### ADR-014 Packaging, signing, updates
- `electron-builder` (NSIS installer, per-user or per-machine to decide in Week 14), ASAR + Electron Fuses (disable `RunAsNode`, node CLI inspect, cookie encryption on, `OnlyLoadAppFromAsar`, ASAR integrity validation).
- Code signing: investigate immediately (OV/EV certificate, managed signing service, eligibility for an Egypt-based developer, cost, token logistics, SmartScreen reputation); choose method by end of Week 2 (D-09, ADR-020).
- Updates: v1 is manual installer-based update (offline-first, fewer attack surfaces); schema migrations always run after an automatic backup. Auto-update (signed, over HTTPS) is a v1.1 option.

### ADR-015 Logging and diagnostics
- `pino` to rotating local files in `%APPDATA%/HESBAN/logs`; log levels; **no** passwords, PINs, keys, full customer lists or financial totals in logs. Diagnostics bundle = logs + schema version + integrity check result, user-reviewable before sharing.

## 5. Transaction pattern for posting (the heart of the system)

```
postSalesInvoice(commandId, input, actor):
  1. validate input (zod) — shape only
  2. BEGIN IMMEDIATE                      -- single writer, fails fast if locked
  3. command_log: if commandId exists → return stored result (idempotent)
  4. load draft/inputs; re-check business rules inside the transaction:
       permissions, open shift, open business date, price/discount limits,
       stock availability, customer credit limit, product active
  5. allocate document number (counter row)
  6. insert invoice + lines
  7. for each line: issue stock at weighted-average → stock_movement, update stock_balance, compute COGS
  8. insert payment(s) + allocations
  9. posting engine → journal_entry + lines (must balance, else throw)
 10. insert audit_log row(s); insert command_log result
 11. run in-transaction invariant assertions (debits = credits; qty/value non-negative)
 12. COMMIT                                -- durable (synchronous=FULL)
 13. after commit (outside tx): enqueue print; emit UI event
```
Any exception ⇒ `ROLLBACK`; nothing partial exists. Steps 4 and 11 are the reason the domain is pure: the same rules are unit-tested without a database and re-asserted in the database.

## 6. IPC and trust boundary

- Renderer is untrusted. All IPC handlers: schema-validate → verify `event.senderFrame` is the app's own origin → resolve session from main-process memory (the renderer never holds an authoritative identity/role) → check permission → execute.
- Channel names are a closed, typed list; no generic "run SQL" or "read file" channel exists.
- Errors cross the boundary as `{ ok:false, code, params }` with stable codes; user-facing Arabic messages are rendered in the renderer from codes. Stack traces and SQL never cross.

## 7. Reporting architecture

Reports are SQL queries over the ledgers/journal executed in a worker with a read-only connection; each report definition has an automated test against a known fixture database with hand-computed totals. Cached/derived tables (e.g. `stock_balance`) are rebuildable from ledgers by the integrity tool.

## 8. Alternatives considered and rejected

| Alternative | Why not (for v1) |
|---|---|
| Local web server (Express) + browser | Extra attack surface (localhost ports), harder to package for non-technical users. |
| Event sourcing everything | Elegant but costly for a solo developer; the immutable ledgers + journal give most of the benefit. |
| PouchDB/CouchDB local-first | Sync is out of scope; relational integrity and SQL reporting are more valuable. |
| Allow editing posted invoices with history | Breaks audit and costing integrity; counter-documents are safer. |

## 9. Architectural risks

1. Native module packaging (SQLite + cipher) on Windows — Week-1 spike.
2. Arabic ESC/POS fragmentation — HTML-via-driver baseline.
3. Single connection blocking UI during long operations — all long work in workers.
4. Schema evolution without data loss — migration tests that replay old fixture DBs; pre-migration backup mandatory.
5. Large-number overflow in cost math — BigInt in domain.
