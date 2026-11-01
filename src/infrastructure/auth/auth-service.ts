import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { can, isRole, type Permission, type Role } from '../../domain/permissions';
import { lockedUntil, secondsRemaining } from '../../application/auth/lockout';
import {
  checkPassword,
  checkPin,
  type PolicyViolation,
} from '../../application/auth/password-policy';
import { appendAudit } from '../db/audit-log';
import type { Db } from '../db/open';
import {
  PASSWORD_PARAMS,
  PIN_PARAMS,
  hashSecret,
  needsRehash,
  verifySecret,
  type HashParams,
} from '../security/password-hasher';

export interface Actor {
  readonly userId: number;
  /** Ignored for authorisation: the service always re-reads the role from the database. */
  readonly role?: Role;
}

export interface PublicUser {
  readonly id: number;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly mustChangePassword: boolean;
}

export type AuthFailure =
  | { readonly error: 'INVALID_CREDENTIALS' }
  | { readonly error: 'LOCKED'; readonly retryAfterSeconds: number }
  | { readonly error: 'POLICY'; readonly violations: PolicyViolation[] }
  | { readonly error: 'FORBIDDEN' }
  | { readonly error: 'NOT_FOUND' }
  | { readonly error: 'USERNAME_TAKEN' }
  | { readonly error: 'FIRST_RUN_ALREADY_DONE' }
  | { readonly error: 'INVALID_ROLE' }
  | { readonly error: 'PIN_NOT_ALLOWED_FOR_ROLE' };

export type AuthResult<T> =
  { readonly ok: true; readonly value: T } | ({ readonly ok: false } & AuthFailure);

const fail = (failure: AuthFailure): { ok: false } & AuthFailure => ({ ok: false, ...failure });
const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  password_hash: string;
  pin_hash: string | null;
  failed_attempts: number;
  locked_until: string | null;
  is_active: number;
  must_change_password: number;
}

export interface AuthOptions {
  readonly db: Db;
  readonly now?: () => Date;
  /** Lower-cost parameters for tests only. */
  readonly params?: { readonly password: HashParams; readonly pin: HashParams };
}

const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_HASH_KEY = 'owner_recovery_hash';
const RECOVERY_FAILS_KEY = 'recovery_failed_attempts';
const RECOVERY_LOCK_KEY = 'recovery_locked_until';
const MAX_UNKNOWN_TRACKED = 1000;

const normalizeUsername = (name: string) => name.normalize('NFKC').trim();
const usernameDigest = (name: string) =>
  createHash('sha256').update(normalizeUsername(name).toLowerCase()).digest('hex').slice(0, 12);

function newRecoveryKey(): string {
  const bytes = randomBytes(20);
  let out = '';
  for (const b of bytes) out += RECOVERY_ALPHABET[b % 32];
  return (out.match(/.{4}/g) as string[]).join('-');
}

const normalizeRecoveryKey = (key: string) => key.toUpperCase().replace(/[^0-9A-Z]/g, '');

export function createAuthService(options: AuthOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());
  const params = options.params ?? { password: PASSWORD_PARAMS, pin: PIN_PARAMS };
  const unknownFailures = new Map<string, { count: number; lockedUntil: string | null }>();
  let dummyHash: Promise<string> | undefined;

  const publicUser = (row: UserRow): PublicUser => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as Role,
    mustChangePassword: row.must_change_password === 1,
  });

  const findByUsername = (username: string) =>
    db.prepare('select * from users where username = ?').get(normalizeUsername(username)) as
      UserRow | undefined;

  const findById = (id: number) =>
    db.prepare('select * from users where id = ?').get(id) as UserRow | undefined;

  const requirePermission = (actor: Actor, permission: Permission): boolean => {
    const row = findById(actor.userId);
    // The role is read from the database, not trusted from the caller.
    return !!row && row.is_active === 1 && isRole(row.role) && can(row.role, permission);
  };

  function audit(
    action: string,
    actorId: number | null,
    entityId?: string,
    details?: Record<string, unknown>,
  ) {
    appendAudit(
      db,
      {
        actorId,
        action,
        entityType: 'user',
        ...(entityId !== undefined ? { entityId } : {}),
        ...(details ? { details } : {}),
      },
      now,
    );
  }

  /** Verifies against a dummy hash so unknown users cost the same time as known ones. */
  async function spendTime(secret: string, kind: 'password' | 'pin') {
    dummyHash ??= hashSecret('dummy-secret-for-timing', params[kind]);
    await verifySecret(secret, await dummyHash);
  }

  function recordFailure(row: UserRow | undefined, username: string, method: string) {
    if (row) {
      const result = db.transaction(() => {
        const attempts = row.failed_attempts + 1;
        const until = lockedUntil(attempts, now());
        db.prepare(
          'update users set failed_attempts = ?, locked_until = ?, updated_at = ? where id = ?',
        ).run(attempts, until ? until.toISOString() : null, now().toISOString(), row.id);
        audit('login.failed', null, String(row.id), { method, attempts, locked: until !== null });
        return { attempts, until };
      })();
      return result;
    }
    const key = usernameDigest(username);
    const entry = unknownFailures.get(key) ?? { count: 0, lockedUntil: null };
    entry.count += 1;
    const until = lockedUntil(entry.count, now());
    entry.lockedUntil = until ? until.toISOString() : null;
    unknownFailures.delete(key);
    unknownFailures.set(key, entry);
    if (unknownFailures.size > MAX_UNKNOWN_TRACKED) {
      unknownFailures.delete(unknownFailures.keys().next().value as string);
    }
    db.transaction(() => {
      audit('login.failed', null, undefined, { method, attempts: entry.count, unknown_user: key });
    })();
    return { attempts: entry.count, until };
  }

  async function authenticate(
    username: string,
    secret: string,
    kind: 'password' | 'pin',
  ): Promise<AuthResult<PublicUser>> {
    const row = findByUsername(username);
    const unknownEntry = row ? undefined : unknownFailures.get(usernameDigest(username));
    const lockUntil = row ? row.locked_until : (unknownEntry?.lockedUntil ?? null);
    const wait = secondsRemaining(lockUntil, now());
    if (wait > 0) {
      db.transaction(() =>
        audit('login.blocked', null, row ? String(row.id) : undefined, { method: kind }),
      )();
      return fail({ error: 'LOCKED', retryAfterSeconds: wait });
    }

    const stored = kind === 'password' ? row?.password_hash : row?.pin_hash;
    const eligible =
      !!row && row.is_active === 1 && !!stored && (kind === 'password' || row.role === 'cashier');
    if (!eligible || !stored) {
      await spendTime(secret, kind);
      const outcome = recordFailure(row, username, kind);
      const remaining = outcome.until ? secondsRemaining(outcome.until.toISOString(), now()) : 0;
      return remaining > 0
        ? fail({ error: 'LOCKED', retryAfterSeconds: remaining })
        : fail({ error: 'INVALID_CREDENTIALS' });
    }

    const valid = await verifySecret(secret, stored);
    if (!valid) {
      const outcome = recordFailure(row, username, kind);
      const remaining = outcome.until ? secondsRemaining(outcome.until.toISOString(), now()) : 0;
      return remaining > 0
        ? fail({ error: 'LOCKED', retryAfterSeconds: remaining })
        : fail({ error: 'INVALID_CREDENTIALS' });
    }

    const rehash = needsRehash(stored, params[kind])
      ? await hashSecret(secret, params[kind])
      : null;
    db.transaction(() => {
      db.prepare(
        'update users set failed_attempts = 0, locked_until = null, updated_at = ? where id = ?',
      ).run(now().toISOString(), row.id);
      if (rehash) {
        db.prepare(
          `update users set ${kind === 'password' ? 'password_hash' : 'pin_hash'} = ? where id = ?`,
        ).run(rehash, row.id);
      }
      audit('login.success', row.id, String(row.id), { method: kind });
    })();
    return ok(publicUser(row));
  }

  return {
    hasUsers(): boolean {
      return (db.prepare('select count(*) c from users').get() as { c: number }).c > 0;
    },

    /** First-run only: creates the owner and returns the recovery key, shown once. */
    async createFirstOwner(input: {
      username: string;
      displayName: string;
      password: string;
    }): Promise<AuthResult<{ user: PublicUser; recoveryKey: string }>> {
      if (this.hasUsers()) return fail({ error: 'FIRST_RUN_ALREADY_DONE' });
      const username = normalizeUsername(input.username);
      const violations = checkPassword(input.password, username);
      if (username.length < 3 || violations.length > 0) {
        return fail({ error: 'POLICY', violations });
      }
      const [passwordHash, recoveryKey] = [
        await hashSecret(input.password, params.password),
        newRecoveryKey(),
      ];
      const recoveryHash = await hashSecret(normalizeRecoveryKey(recoveryKey), params.password);
      return db.transaction(() => {
        if (this.hasUsers()) return fail({ error: 'FIRST_RUN_ALREADY_DONE' });
        const stamp = now().toISOString();
        const id = Number(
          db
            .prepare(
              `insert into users(uuid, username, display_name, role, password_hash, created_at, updated_at)
               values (?, ?, ?, 'owner', ?, ?, ?)`,
            )
            .run(randomUUID(), username, input.displayName.trim(), passwordHash, stamp, stamp)
            .lastInsertRowid,
        );
        db.prepare('insert into app_meta(key, value) values (?, ?)').run(
          RECOVERY_HASH_KEY,
          recoveryHash,
        );
        audit('user.create_first_owner', id, String(id), { role: 'owner' });
        const user = publicUser(findById(id) as UserRow);
        return ok({ user, recoveryKey });
      })();
    },

    login: (input: { username: string; password: string }) =>
      authenticate(input.username, input.password, 'password'),

    /** Cashier quick sign-in. Managers and owners cannot use a PIN. */
    loginWithPin: (input: { username: string; pin: string }) => {
      const pin = checkPin(input.pin);
      return authenticate(input.username, pin.ok ? pin.pin : input.pin, 'pin');
    },

    async createUser(
      actor: Actor,
      input: {
        username: string;
        displayName: string;
        role: Role;
        password: string;
        pin?: string | undefined;
      },
    ): Promise<AuthResult<PublicUser>> {
      if (!requirePermission(actor, 'users.manage')) return fail({ error: 'FORBIDDEN' });
      if (!isRole(input.role)) return fail({ error: 'INVALID_ROLE' });
      const username = normalizeUsername(input.username);
      const violations = checkPassword(input.password, username);
      if (username.length < 3 || violations.length > 0)
        return fail({ error: 'POLICY', violations });
      if (findByUsername(username)) return fail({ error: 'USERNAME_TAKEN' });

      let pinHash: string | null = null;
      if (input.pin !== undefined) {
        if (input.role !== 'cashier') return fail({ error: 'PIN_NOT_ALLOWED_FOR_ROLE' });
        const pin = checkPin(input.pin);
        if (!pin.ok) return fail({ error: 'POLICY', violations: pin.problems });
        pinHash = await hashSecret(pin.pin, params.pin);
      }
      const passwordHash = await hashSecret(input.password, params.password);
      return db.transaction(() => {
        if (findByUsername(username)) return fail({ error: 'USERNAME_TAKEN' });
        const stamp = now().toISOString();
        const id = Number(
          db
            .prepare(
              `insert into users(uuid, username, display_name, role, password_hash, pin_hash, must_change_password, created_at, updated_at)
               values (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            )
            .run(
              randomUUID(),
              username,
              input.displayName.trim(),
              input.role,
              passwordHash,
              pinHash,
              stamp,
              stamp,
            ).lastInsertRowid,
        );
        audit('user.create', actor.userId, String(id), { role: input.role, pin: pinHash !== null });
        return ok(publicUser(findById(id) as UserRow));
      })();
    },

    async changeOwnPassword(
      userId: number,
      current: string,
      next: string,
    ): Promise<AuthResult<true>> {
      const row = findById(userId);
      if (!row || row.is_active !== 1) return fail({ error: 'NOT_FOUND' });
      if (secondsRemaining(row.locked_until, now()) > 0) {
        return fail({
          error: 'LOCKED',
          retryAfterSeconds: secondsRemaining(row.locked_until, now()),
        });
      }
      if (!(await verifySecret(current, row.password_hash))) {
        const outcome = recordFailure(row, row.username, 'change_password');
        return outcome.until
          ? fail({
              error: 'LOCKED',
              retryAfterSeconds: secondsRemaining(outcome.until.toISOString(), now()),
            })
          : fail({ error: 'INVALID_CREDENTIALS' });
      }
      const violations = checkPassword(next, row.username);
      if (violations.length > 0) return fail({ error: 'POLICY', violations });
      const hash = await hashSecret(next, params.password);
      db.transaction(() => {
        db.prepare(
          'update users set password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = null, updated_at = ? where id = ?',
        ).run(hash, now().toISOString(), userId);
        audit('user.password_change', userId, String(userId));
      })();
      return ok(true);
    },

    /** Owner action. The user must change the password at next login. Returns ids whose sessions must end. */
    async resetPassword(
      actor: Actor,
      targetId: number,
      newPassword: string,
    ): Promise<AuthResult<{ revokeUserId: number }>> {
      if (!requirePermission(actor, 'users.manage')) return fail({ error: 'FORBIDDEN' });
      const target = findById(targetId);
      if (!target) return fail({ error: 'NOT_FOUND' });
      const violations = checkPassword(newPassword, target.username);
      if (violations.length > 0) return fail({ error: 'POLICY', violations });
      const hash = await hashSecret(newPassword, params.password);
      db.transaction(() => {
        db.prepare(
          'update users set password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = null, updated_at = ? where id = ?',
        ).run(hash, now().toISOString(), targetId);
        audit('user.password_reset', actor.userId, String(targetId));
      })();
      return ok({ revokeUserId: targetId });
    },

    async setRole(
      actor: Actor,
      targetId: number,
      role: Role,
    ): Promise<AuthResult<{ revokeUserId: number }>> {
      if (!requirePermission(actor, 'users.manage')) return fail({ error: 'FORBIDDEN' });
      if (!isRole(role)) return fail({ error: 'INVALID_ROLE' });
      const target = findById(targetId);
      if (!target) return fail({ error: 'NOT_FOUND' });
      try {
        db.transaction(() => {
          db.prepare('update users set role = ?, updated_at = ? where id = ?').run(
            role,
            now().toISOString(),
            targetId,
          );
          if (role !== 'cashier')
            db.prepare('update users set pin_hash = null where id = ?').run(targetId);
          audit('user.role_change', actor.userId, String(targetId), {
            from: target.role,
            to: role,
          });
        })();
      } catch {
        return fail({ error: 'FORBIDDEN' }); // the last active owner trigger
      }
      return ok({ revokeUserId: targetId });
    },

    async deactivate(
      actor: Actor,
      targetId: number,
    ): Promise<AuthResult<{ revokeUserId: number }>> {
      if (!requirePermission(actor, 'users.manage')) return fail({ error: 'FORBIDDEN' });
      if (!findById(targetId)) return fail({ error: 'NOT_FOUND' });
      try {
        db.transaction(() => {
          db.prepare('update users set is_active = 0, updated_at = ? where id = ?').run(
            now().toISOString(),
            targetId,
          );
          audit('user.deactivate', actor.userId, String(targetId));
        })();
      } catch {
        return fail({ error: 'FORBIDDEN' });
      }
      return ok({ revokeUserId: targetId });
    },

    /** Forgotten owner password: the recovery key shown at setup resets it and issues a new key. */
    async resetOwnerWithRecoveryKey(input: {
      username: string;
      recoveryKey: string;
      newPassword: string;
    }): Promise<AuthResult<{ recoveryKey: string }>> {
      const meta = (key: string) =>
        (
          db.prepare('select value from app_meta where key = ?').get(key) as
            { value: string } | undefined
        )?.value;
      const wait = secondsRemaining(meta(RECOVERY_LOCK_KEY) ?? null, now());
      if (wait > 0) return fail({ error: 'LOCKED', retryAfterSeconds: wait });

      const owner = findByUsername(input.username);
      const stored = meta(RECOVERY_HASH_KEY);
      const valid =
        !!owner &&
        owner.role === 'owner' &&
        owner.is_active === 1 &&
        !!stored &&
        (await verifySecret(normalizeRecoveryKey(input.recoveryKey), stored));
      if (!valid) {
        if (!owner || !stored) await spendTime(input.recoveryKey, 'password');
        const attempts = Number(meta(RECOVERY_FAILS_KEY) ?? '0') + 1;
        const until = lockedUntil(attempts, now());
        db.transaction(() => {
          const put = db.prepare(
            'insert into app_meta(key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
          );
          put.run(RECOVERY_FAILS_KEY, String(attempts));
          put.run(RECOVERY_LOCK_KEY, until ? until.toISOString() : '');
          audit('recovery.failed', null, undefined, { attempts });
        })();
        return until
          ? fail({
              error: 'LOCKED',
              retryAfterSeconds: secondsRemaining(until.toISOString(), now()),
            })
          : fail({ error: 'INVALID_CREDENTIALS' });
      }
      const violations = checkPassword(input.newPassword, (owner as UserRow).username);
      if (violations.length > 0) return fail({ error: 'POLICY', violations });
      const passwordHash = await hashSecret(input.newPassword, params.password);
      const recoveryKey = newRecoveryKey();
      const recoveryHash = await hashSecret(normalizeRecoveryKey(recoveryKey), params.password);
      db.transaction(() => {
        db.prepare(
          'update users set password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = null, updated_at = ? where id = ?',
        ).run(passwordHash, now().toISOString(), (owner as UserRow).id);
        const put = db.prepare(
          'insert into app_meta(key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
        );
        put.run(RECOVERY_HASH_KEY, recoveryHash);
        put.run(RECOVERY_FAILS_KEY, '0');
        put.run(RECOVERY_LOCK_KEY, '');
        audit('recovery.used', (owner as UserRow).id, String((owner as UserRow).id));
      })();
      return ok({ recoveryKey });
    },

    listUsers(actor: Actor): AuthResult<Array<PublicUser & { isActive: boolean }>> {
      if (!requirePermission(actor, 'users.manage')) return fail({ error: 'FORBIDDEN' });
      const rows = db.prepare('select * from users order by id').all() as UserRow[];
      return ok(rows.map((r) => ({ ...publicUser(r), isActive: r.is_active === 1 })));
    },

    getUser(id: number): PublicUser | null {
      const row = findById(id);
      return row && row.is_active === 1 ? publicUser(row) : null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
