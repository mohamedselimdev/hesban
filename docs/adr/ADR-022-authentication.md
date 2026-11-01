# ADR-022 — Authentication, sessions and authorisation

Status: Accepted for v1 (W2-03, 2026-11-01). Mechanisms implemented and tested; UI and IPC wiring follow in W2-04.

## Context
Local users on a shop PC, no internet. Threats: dishonest cashier, shared PINs, brute force at the keyboard, offline guessing if the database file is copied, a compromised renderer. Requirements AUTH-01…05, SEC-04, mandatory rules 6, 8, 11.

## Decision
- **Password hash: scrypt from Node's `crypto`** (no native dependency). Passwords N = 2^17, r = 8, p = 1 (OWASP minimum for scrypt; measured on the dev machine: about 270 ms, 128 MB); PINs N = 2^15 (about 70 ms). Parameters are stored in the hash string (`scrypt$N$r$p$salt$hash`), parsing refuses absurd values, and a successful login re-hashes if parameters are weaker than the current setting. Argon2id was not chosen because it needs a native module; revisit only if a measured need appears.
- **Policy:** passwords 10–128 characters, not common, not containing the username, not one repeated character; PINs 4–8 digits in any digit script, not sequences or repeats. PINs are for cashiers only; managers and owners sign in with a password.
- **Lockout:** five free failures, then 30 s doubling to 15 minutes; stored in the database so a restart does not reset it; unknown usernames get the same behaviour (in memory) so locking does not reveal which users exist; the right password is refused while locked; unknown users cost the same hashing time as real ones.
- **Audit:** every login success, failure, block, user change and recovery use is appended to the hash-chained audit log in the same transaction as the change. Typed usernames of unknown users are never stored (a 12-character digest only), because people type passwords into username fields.
- **Sessions:** main-process memory only, keyed by the id of the window that logged in. The renderer never holds a token or a role. Idle expiry 15 minutes (sliding), hard limit 12 hours; role change, deactivation and password reset revoke the user's sessions.
- **Authorisation:** a static role → permission map (`src/domain/permissions.ts`) mirroring the business-rules matrix, checked in the main process. Service methods re-read the actor's role and active flag from the database, so a forged role from the caller is ignored.
- **Last owner:** a database trigger and the service refuse to demote or deactivate the last active owner. Users are never deleted.
- **Recovery:** the first owner receives a 100-bit recovery key shown once and stored only as a scrypt hash; it resets the owner password, rotates itself, and is rate-limited (persisted lockout). There is no vendor backdoor.

## Alternatives considered
Argon2id (native dependency); bcrypt (72-byte limit, weaker memory hardness); token-based sessions in the renderer (steal-able by a compromised page); in-memory-only lockout (reset by restart).

## Consequences
- A login costs about 0.3 s on this machine and likely 0.5–1 s on a low-end PC; PIN sign-in is faster. To be measured on target hardware.
- A 4–8 digit PIN can be guessed offline if both the database file and its key are obtained; the database encryption and the lockout are the protections.
- The in-memory counter for unknown usernames resets on restart (small, bounded: 1,000 entries).
- Forgetting both the password and the recovery key means data stays encrypted and unreachable except through an encrypted backup restore.

## Evidence
`tests/unit/permissions.test.ts`, `tests/unit/auth-primitives.test.ts`, `tests/integration/auth-service.test.ts` (see DEVLOG for counts and results). Not yet tested: behaviour on a low-end PC, concurrent logins from two windows, UI flows.
