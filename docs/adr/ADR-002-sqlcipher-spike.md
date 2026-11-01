# ADR-002 Evidence — SQLite encryption at rest (W1-04 spike)

Status: spike complete 2026-11-01 · Decision remains **conditionally approved**; recommendation below needs owner confirmation.
Spike code: `tools/spikes/sqlite/` (not shipped). Machine: Windows 11, Node 24.12.0, Electron 45.2.1. No MSVC/`msbuild` installed on this machine.

## Candidates

| Candidate | Version | Licence | Windows x64 | Result |
|---|---|---|---|---|
| `better-sqlite3` (baseline, no encryption) | 13.0.3 | MIT | prebuilt, loads | Baseline only |
| `better-sqlite3-multiple-ciphers`, cipher `sqlcipher`, `legacy=4` | 13.0.3 (SQLite 3.53.4) | MIT | prebuilt `prebuilds/win32-x64.node` bundled in the npm tarball, no compiler needed | **Viable** |
| `@signalapp/sqlcipher` | 4.1.0 | **AGPL-3.0-only** | loads | **Rejected**: AGPL is incompatible with a proprietary commercial product |
| `@journeyapps/sqlcipher` | 6.0.0 | BSD-3-Clause | npm refuses install: package restricted to `darwin,linux` | **Rejected** for Windows |

Note: the multiple-ciphers default cipher is `chacha20`, not SQLCipher. The app must set `cipher='sqlcipher'` and `legacy=4` before `key`.

## What was tested and measured

All ran on Node (ABI 137) and on Electron's Node (ABI 150, via `ELECTRON_RUN_AS_NODE`) unless noted.

| Area | Result |
|---|---|
| Native load | Loads on both ABIs with no rebuild step. |
| Pragmas | `journal_mode=wal`, `synchronous=2 (FULL)`, `foreign_keys=1`, `trusted_schema=0`, STRICT tables work. |
| Encryption at rest | Header is not `SQLite format 3`; a unique marker string is absent from `.db` and from the live `.db-wal` before checkpoint and from `.db` after checkpoint. |
| Wrong key / no key / plain driver | All fail with `file is not a database`. |
| Key rotation | `PRAGMA rekey` works; old key then fails, new key opens. |
| Key wrapping (`safeStorage`, DPAPI, Electron main process) | Random 256-bit key wrap/unwrap round trip OK; blob does not contain the plain key; tampered blob rejected; DB opened with the unwrapped key. The synchronous API (`encryptString`/`decryptString`) logs a **deprecation warning in Electron 45**; the async API (`encryptStringAsync`/`decryptStringAsync`, `isAsyncEncryptionAvailable`) works and `decryptStringAsync` returns `{ shouldReEncrypt, result }`. Production code must use the async API and honour `shouldReEncrypt`. |
| Backup | `VACUUM INTO` of an encrypted DB produces an **encrypted** copy (no plaintext intermediate). Container `HBK1`: scrypt (N=2^15, r=8, p=1) + AES-256-GCM with header as AAD; payload = DB key + DB copy. 5,000-row DB: 61,520 bytes, 90 ms. |
| Restore on a "replacement PC" | Original DB key discarded; restored using only the passphrase and backup file; `integrity_check` ok; data sum matches; DB re-keyed with a new device key; rows intact. |
| Backup tamper | Wrong passphrase, flipped bit in header / nonce / body / tag, and a truncated file are all rejected (GCM authentication). |
| Migration on encrypted DB | Versioned migrations are idempotent; checksum tamper detected; a failing migration rolls back fully. |
| Crash test | See "Crash test" below. |

### Benchmarks (Node 24.12.0, 1,000,000 `stock_movements` rows, 50,000 products)

| Metric | Plain | Encrypted (sqlcipher mode) | Budget |
|---|---|---|---|
| Bulk insert 1M rows (10k-row transactions) | 15.5 s | 30.3 s (+95%) | none (import only) |
| 20-line posting-like transaction, p50 / p95 / max | 1.01 / 1.67 / 8.69 ms | 1.56 / 2.25 / 11.88 ms | p95 < 300 ms (NFR-03) |
| Barcode lookup, p50 / p95 | 0.006 / 0.013 ms | 0.007 / 0.029 ms | p95 < 150 ms scan-to-line (NFR-02) |

Electron ABI, 200,000 rows: posting p95 1.62 ms plain vs 3.97 ms encrypted; barcode p95 0.012 vs 0.017 ms.
Relative overhead is large for bulk writes (+60–95%) and for posting p95 (+35–145%), but absolute latencies are two orders of magnitude inside the budgets. The "within 15%" figure in the earlier draft was my own heuristic, not an approved criterion; absolute budgets are the meaningful test.
Not measured: low-end hardware (Celeron/HDD), database file-size overhead, startup time.

## Crash test

`tools/spikes/sqlite/crash.mjs`: a child process opens the encrypted DB (WAL, `synchronous=FULL`) and posts documents in a tight loop (document + 5 lines + 2 balanced journal lines per `BEGIN IMMEDIATE` transaction). The parent kills it with `TerminateProcess` after a random 5–125 ms delay, reopens with the key, then checks `PRAGMA integrity_check`, "every document has exactly 5 lines summing to its total", "every journal entry balances", and "no orphan lines".

Result (2026-11-01): **500 iterations, 0 integrity failures**; every iteration had newly committed documents (44,341 documents at the end). Because the child writes continuously, kills almost certainly landed mid-transaction, but the harness does not record where each kill landed.

## Limits of this evidence (not proven)

1. **No byte-level interoperability check against Zetetic SQLCipher 4.** No reference SQLCipher tool was available. "SQLCipher-compatible" rests on the library's documented `sqlcipher` cipher mode. If true SQLCipher compatibility is a requirement (e.g. opening files in third-party tools), it must be verified with a reference build.
2. Process termination (`TerminateProcess`) is not power loss. It tests transaction atomicity and WAL recovery, not disk-cache or fsync behaviour. A VM power-cut test remains for Week 12.
3. Run on one machine, one SQLite build, SSD. Not on a low-end PC.
4. The prebuilt `.node` binary comes from the npm tarball; its build provenance is not independently verified. Mitigation options: pin exact version and lockfile integrity, compare against a CI source build, review on each upgrade.
5. DPAPI binding to the Windows user was observed to work but cannot be shown to fail on another PC here; the replacement-PC path is covered only by the passphrase-based restore test.

## Recommendation

Adopt `better-sqlite3-multiple-ciphers` in `sqlcipher` / `legacy=4` mode with a random raw 256-bit key wrapped by `safeStorage` async API, plus passphrase-encrypted backup containers (HBK1 design above) that carry the DB key so a replacement PC can restore. Keep ADR-002 "conditionally approved" until: (a) the crash test result is reviewed, (b) the owner accepts limit 1 or a reference-SQLCipher check is scheduled, (c) CI builds and tests on a clean Windows 11 image.

Fallback if any of those fail: documented-risk review and explicit owner decision before shipping unencrypted SQLite (encrypted backups remain mandatory).
