# HESBAN — Security Threat Model (v1)

Status: APPROVED WITH CONDITIONS (see [decisions.md](decisions.md)) · Revised: 2026-11-01 · Method: asset/actor/trust-boundary analysis with STRIDE per boundary

## 1. Honest security goals

HESBAN runs on a shop PC that the shop's staff physically use, often as Windows administrators. We cannot defeat an attacker who has administrator rights and time. The realistic goals are:

1. **Protect confidentiality** of business data if the PC, disk or a backup file is stolen or copied.
2. **Make tampering evident** (audit chain, immutable ledgers, integrity checker) rather than impossible.
3. **Prevent ordinary insiders** (cashiers) from exceeding their role through the UI or IPC.
4. **Prevent renderer compromise** (XSS from data such as product names) from becoming code execution or data exfiltration.
5. **Keep data recoverable** (backups, restore) even against our own bugs and user mistakes.
6. **Do not hold the customer's data hostage** (licence never blocks export).

Out of scope: nation-state attackers, hardware implants, defeating a malicious Windows administrator, DRM-grade licensing.

## 2. Assets

| ID | Asset | Why it matters |
|---|---|---|
| A1 | Financial records (invoices, ledgers, journal) | Integrity = the product. |
| A2 | Stock and cost data | Cost/profit confidential from cashiers and competitors. |
| A3 | Customer/supplier data (names, phones, balances) | Personal data; commercial sensitivity. |
| A4 | Credentials (password/PIN hashes, DB key, backup key, recovery key) | Gate to everything. |
| A5 | Backups | Full copy of A1–A3 outside the machine. |
| A6 | License file and vendor signing key | Revenue; vendor key compromise is catastrophic. |
| A7 | Application binary integrity | Malicious replacement = full compromise. |
| A8 | Audit log | Evidence for disputes. |

## 3. Actors

| Actor | Capability | Motivation |
|---|---|---|
| Dishonest cashier | Uses UI, keyboard; maybe basic tools (DB browser) | Skim cash, fake returns, discount friends, hide sales. |
| Curious employee | Windows user without admin | Read costs/profit/customer list. |
| Shop owner (negligent) | Weak passwords, shares PIN, no backups | Unintentional damage. |
| Thief | Steals PC/disk/USB backup | Data resale; ransom. |
| Opportunistic malware | Runs as the Windows user | Ransomware (encrypts DB/backups), info stealer. |
| Malicious file supplier | Crafts a CSV import or backup file | Exploit parser/restore. |
| Software pirate | Modifies licence or app | Free use. |
| Network attacker | Only if internet features exist | MITM update, license server (none in v1). |

## 4. Trust boundaries and data flows

```
[Human] ⇄ [Renderer (sandboxed Chromium, untrusted)]
                 │  B1: contextBridge + IPC (validated, authorised)
          [Main process (trusted, holds session + DB key)]
                 │  B2: SQLite API            │ B3: file system (backups, exports, imports)
          [DB file (encrypted)]          [Backup files, CSV/XLSX, receipts]
                 │  B4: OS (printer drivers, DPAPI, USB)
```
Internet: none in v1 runtime path. (Any future update/ETA channel becomes a new boundary and needs its own review.)

## 5. Threats and mitigations

Severity = impact × likelihood in the target environment (H/M/L). "Residual" is what remains after mitigations.

### B1 — Renderer ⇄ Main (IPC)
| # | Threat (STRIDE) | Sev | Mitigations | Residual |
|---|---|---|---|---|
| T1 | XSS in renderer via product/party names, notes, imported CSV (Tampering/EoP) | H | React escaping; no `dangerouslySetInnerHTML`; strict CSP (`default-src 'self'`, no inline/eval); sanitise receipt HTML (render from structured data, not strings); `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, no `webviewTag`, `setWindowOpenHandler` deny, `will-navigate` block. | Low |
| T2 | Compromised renderer calls privileged IPC (EoP) | H | Closed typed channel list; per-call zod validation; authorise permission from main-process session (renderer-supplied role ignored); sender-frame/origin check; no generic fs/SQL/shell channel; rate limiting for login. | Low |
| T3 | Cashier crafts requests via devtools to bypass UI limits | M | DevTools disabled in production; every rule re-checked server-side (main) inside the transaction. | Low |
| T4 | Session theft/fixation | M | Session token only in main memory; renderer holds opaque handle; auto-lock; logout clears. | Low |
| T5 | Prototype pollution / deserialisation via IPC payloads | M | zod `.strict()` schemas; no `eval`/`Function`; structured clone only. | Low |

### Authentication and authorisation
| # | Threat | Sev | Mitigations | Residual |
|---|---|---|---|---|
| T6 | Brute-force passwords/PINs | H | Argon2id/scrypt; PIN lockout with exponential back-off persisted in DB; constant-time compare; PIN only for cashier role and not for sensitive actions (Manager/Owner require password). | Medium (PIN space small by nature) |
| T7 | Shared/weak credentials | M | Password strength check; forced change of any default; no default accounts shipped. | Medium |
| T8 | Privilege escalation by changing own role in DB | M | See T10 (DB tampering). In-app: role change only by Owner; last-owner protection. | Medium |
| T9 | Lost owner password | M | Recovery key generated at setup (stored by owner); no vendor backdoor. | Accepted: if both lost, data unrecoverable except via unencrypted exports. |

### B2 — Database and data at rest
| # | Threat | Sev | Mitigations | Residual |
|---|---|---|---|---|
| T10 | Employee/administrator edits the DB with a SQLite tool to alter history | H | Encryption at rest (key in DPAPI, not user-visible); immutability triggers; hash-chained audit log; integrity checker detects ledger/journal inconsistency; periodic chain head stored in backups. | Medium: a Windows admin who is the same user as the app can extract the key via DPAPI — detection, not prevention. |
| T11 | Stolen PC/disk exposes data | H | DB encrypted; recommend BitLocker in installation guide; no plaintext exports left behind (exports written to user-chosen folder with warning). | Low–Medium |
| T12 | SQL injection | H | Parameterised queries only (Kysely); lint ban on string-built SQL; FTS query escaping; tests with injection corpora. | Low |
| T13 | Ransomware encrypts DB and local backups | H | Backup to second location/external drive prompt; keep N versions; backup verification; warning when last off-device backup is stale; recovery drills. | Medium (cannot stop ransomware) |
| T14 | Corruption (power loss, disk fault) | H | WAL + `synchronous=FULL`; integrity_check on start/after backup; crash-injection tests; auto backup before migration. | Low |
| T15 | Secrets in logs/crash dumps | M | Log scrubbing rules; no secrets logged; crash reporter local only; diagnostics bundle reviewed by user. | Low |

### B3 — Files (backup, import, export)
| # | Threat | Sev | Mitigations | Residual |
|---|---|---|---|---|
| T16 | Malicious/corrupt backup file on restore | H | Authenticated encryption (GCM) fails closed; header version/size limits; restore into temp DB; `integrity_check` + schema check + invariant checker before swap; never executes content. | Low |
| T17 | Malicious CSV/XLSX import (formula injection, huge files, bad encoding) | M | Size/row limits; parse in worker; strict column validation; on export prefix cells starting with `= + - @` with `'` (CSV injection); XLSX parsing library kept updated and used in a sandboxed worker. | Low |
| T18 | Path traversal via file dialogs/IPC | M | Paths only from native dialogs returned by main; no renderer-provided arbitrary paths; normalise and constrain. | Low |
| T19 | Backup passphrase weak/lost | M | Strength meter; recovery key option; clear warning of irrecoverability. | Accepted |

### B4 — OS, hardware and supply chain
| # | Threat | Sev | Mitigations | Residual |
|---|---|---|---|---|
| T20 | Malicious HID device types commands as a "scanner" | L | Scanner input only fills barcode lookup fields; no command execution; barcode strings treated as data. | Low |
| T21 | Tampered installer or update | H | Code signing; installer hash published on the vendor site; ASAR integrity fuse; no auto-update in v1; installer served over HTTPS only. | Low–Medium |
| T22 | Dependency compromise (npm supply chain) | H | Lockfile, `pnpm audit`/OSV scan in CI, minimal dependencies, pinned versions, review of new native deps, no postinstall scripts allowed by default, SBOM per release. | Medium |
| T23 | Electron/Chromium vulnerabilities | H | Track Electron security releases; 30-day patch policy; no remote content loaded; renderer sandbox. | Low–Medium |
| T24 | DLL planting / binary replacement in install dir | M | Per-machine install in `Program Files` (admin-write only); ASAR integrity; signed binaries. | Medium (if installed per-user) |

### Licensing
| # | Threat | Sev | Mitigations | Residual |
|---|---|---|---|---|
| T25 | Licence forged | M | Ed25519 signatures; private key offline in the separate issuer tool, HSM/hardware token if feasible; key rotation plan (embedded key id). | Low |
| T26 | Patched binary removes checks | M | Accepted — deterrent only; focus on support/updates value. | High (accepted) |
| T27 | Clock rollback to extend licence | L | Monotonic last-seen timestamp; log event; no data lock-out. | Medium (accepted) |
| T28 | Licence expiry blocks the customer's own data | **H business risk** | Read-only mode preserves view/export/backup/restore; tested explicitly. | Low |

### Privacy
| # | Threat | Mitigation |
|---|---|---|
| T29 | Personal data of customers (phone/address) leaks via exports/logs | Minimise fields; no telemetry in v1; logs exclude personal fields; Owner-only export with warning. |
| T30 | Retention of data after customer leaves | Provide export; documented deletion/anonymisation procedure for a party with zero balance (v1.1). |

## 6. Security requirements (checklist for the build)

- SEC-01 Electron: `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, `webSecurity:true`, `allowRunningInsecureContent:false`, no `remote`, no `webview`, window-open/navigation handlers, CSP via header/meta, permission requests denied by default.
- SEC-02 Fuses: `RunAsNode=false`, `EnableNodeOptionsEnvironmentVariable=false`, `EnableNodeCliInspectArguments=false`, `OnlyLoadAppFromAsar=true`, `EnableEmbeddedAsarIntegrityValidation=true`, `EnableCookieEncryption=true`.
- SEC-03 IPC: central `defineHandler({ schema, permission, handler })` wrapper; no handler may be registered outside it (lint + test enumerates registered channels).
- SEC-04 Passwords: Argon2id (preferred, via audited prebuilt binding) or scrypt (Node built-in) with documented parameters; minimum length; PIN lockout persisted.
- SEC-05 Keys: DB key random 256-bit, wrapped via `safeStorage`; backup key from passphrase via KDF; keys zeroised after use where feasible; never logged.
- SEC-06 Parameterised SQL only; `trusted_schema=OFF`; no `ATTACH` from user input; `load_extension` disabled.
- SEC-07 Audit: every login (success/failure), lockout, permission-denied attempt, price override, discount over limit, cancellation, return, adjustment, backup, restore, export, user/role change, licence event, settings change.
- SEC-08 Exports and backups: CSV-injection mitigation; temp files in app-private dir and securely removed.
- SEC-09 Updates: signed installers only; no code downloaded at runtime.
- SEC-10 Dependency policy: CI audit, license check, lockfile integrity, Renovate/Dependabot-style review (manually triggered offline-friendly).
- SEC-11 Secrets hygiene: no secrets or keys in repository; license issuer key never in this repo; `.env` never committed.
- SEC-12 Error handling: no stack traces or SQL to UI; generic message + error code + correlation id logged locally.

## 7. Security test plan (summary — details in testing strategy)

- Automated: IPC fuzzing with malformed payloads; permission-matrix tests for every channel × role; CSP and window-option assertions; fuse verification script on built artifact; SQL-injection corpus on every text input path; backup tamper tests (bit-flip ⇒ restore refuses); migration tamper (checksum) test; log-scrubbing tests.
- Manual (Week 13): threat-model walkthrough, devtools-in-production check, installer review, dependency review, ransomware-scenario restore drill.

## 8. Open security decisions

1. Per-user vs per-machine installation (affects T24).
2. Argon2id native binding vs Node `scrypt` (no native dependency) — recommended: scrypt (built-in) for v1 to reduce native-module risk, with parameters tuned and documented; revisit.
3. SQLCipher is conditionally approved (ADR-002). If the spike fails: evaluate alternatives, document the security risk, and get an explicit owner decision before any unencrypted fallback. Encrypted backups stay mandatory.
4. Code-signing approach and cost (D-09): investigate now, decide by end of Week 2.
6. Replacement-PC recovery: the DB key wrapped by DPAPI does not travel to another PC or Windows profile. Recovery relies on the encrypted backup, its passphrase or the recovery key; this path is tested explicitly (testing strategy §5).
7. Windows 10 support only after D-10 checks; Windows 11 is the primary hardened target.
5. Who stores the recovery key (owner printed copy) and the support policy when it is lost.
