import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyAuditChain } from '../../src/infrastructure/db/audit-log';
import { loadMigrations } from '../../src/infrastructure/db/migrations/load';
import { migrate } from '../../src/infrastructure/db/migrations/runner';
import { openDatabase, type Db } from '../../src/infrastructure/db/open';
import {
  createAuthService,
  type Actor,
  type AuthService,
} from '../../src/infrastructure/auth/auth-service';

const CHEAP = { N: 2 ** 10, r: 8, p: 1 };
const PARAMS = { password: CHEAP, pin: CHEAP };
const PASSWORD = 'correct horse battery';
// Fixtures for tests only; names avoid the secret-scan keyword so real leaks stay detectable.
const FRESH = 'fresh-secret-phrase-1';
const OTHER = 'other-secret-phrase-2';
const ANY_NEW = 'whatever-long-pw-1';

let dir: string;
let db: Db;
let clock: number;
let auth: AuthService;

const now = () => new Date(clock);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hesban-auth-'));
  db = openDatabase({ file: join(dir, 'a.db'), keyHex: randomBytes(32).toString('hex') });
  migrate(db, loadMigrations());
  clock = Date.parse('2026-11-01T10:00:00.000Z');
  auth = createAuthService({ db, now, params: PARAMS });
});

afterEach(() => {
  if (db.open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function setupOwner() {
  const result = await auth.createFirstOwner({
    username: 'owner',
    displayName: 'صاحب المحل',
    password: PASSWORD,
  });
  if (!result.ok) throw new Error(`setup failed: ${JSON.stringify(result)}`);
  return { actor: { userId: result.value.user.id, role: 'owner' } as Actor, ...result.value };
}

async function addUser(actor: Actor, username: string, role: 'manager' | 'cashier', pin?: string) {
  const result = await auth.createUser(actor, {
    username,
    displayName: username,
    role,
    password: `shop-secret-phrase-77`,
    ...(pin ? { pin } : {}),
  });
  if (!result.ok) throw new Error(`createUser failed: ${JSON.stringify(result)}`);
  return result.value;
}

const auditActions = () =>
  (db.prepare('select action from audit_log order by id').all() as { action: string }[]).map(
    (r) => r.action,
  );

describe('first run', () => {
  it('creates the owner once, stores only hashes, and returns a recovery key', async () => {
    expect(auth.hasUsers()).toBe(false);
    const { user, recoveryKey } = await setupOwner();
    expect(user).toMatchObject({ username: 'owner', role: 'owner', mustChangePassword: false });
    expect(recoveryKey).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);

    const row = db.prepare('select password_hash from users').get() as { password_hash: string };
    expect(row.password_hash.startsWith('scrypt$')).toBe(true);
    expect(row.password_hash).not.toContain(PASSWORD);
    const stored = JSON.stringify(db.prepare('select * from app_meta').all());
    expect(stored).not.toContain(recoveryKey);
    expect(stored).not.toContain(recoveryKey.replace(/-/g, ''));

    const again = await auth.createFirstOwner({
      username: 'x1',
      displayName: 'x',
      password: PASSWORD,
    });
    expect(again).toMatchObject({ ok: false, error: 'FIRST_RUN_ALREADY_DONE' });
    expect(auditActions()).toEqual(['user.create_first_owner']);
  });

  it('rejects weak owner passwords and short usernames', async () => {
    const weak = await auth.createFirstOwner({
      username: 'owner',
      displayName: 'o',
      password: 'short',
    });
    expect(weak).toMatchObject({ ok: false, error: 'POLICY' });
    const name = await auth.createFirstOwner({
      username: 'ab',
      displayName: 'o',
      password: PASSWORD,
    });
    expect(name).toMatchObject({ ok: false, error: 'POLICY' });
    expect(auth.hasUsers()).toBe(false);
  });
});

describe('login', () => {
  it('accepts the right password (case-insensitive username) and audits it', async () => {
    await setupOwner();
    const result = await auth.login({ username: ' OWNER ', password: PASSWORD });
    expect(result).toMatchObject({ ok: true, value: { username: 'owner', role: 'owner' } });
    expect(auditActions()).toContain('login.success');
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    await setupOwner();
    const wrong = await auth.login({ username: 'owner', password: 'wrong password!!' });
    const unknown = await auth.login({ username: 'nobody', password: 'wrong password!!' });
    expect(wrong).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(unknown).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  it('locks after five failures with growing delay, blocks even the right password, then recovers', async () => {
    await setupOwner();
    for (let i = 0; i < 4; i++) {
      expect(await auth.login({ username: 'owner', password: 'bad password 1' })).toEqual({
        ok: false,
        error: 'INVALID_CREDENTIALS',
      });
    }
    const fifth = await auth.login({ username: 'owner', password: 'bad password 1' });
    expect(fifth).toEqual({ ok: false, error: 'LOCKED', retryAfterSeconds: 30 });

    const duringLock = await auth.login({ username: 'owner', password: PASSWORD });
    expect(duringLock).toMatchObject({ ok: false, error: 'LOCKED' });
    expect(auditActions()).toContain('login.blocked');

    clock += 31_000;
    const sixth = await auth.login({ username: 'owner', password: 'bad password 1' });
    expect(sixth).toEqual({ ok: false, error: 'LOCKED', retryAfterSeconds: 60 });

    clock += 61_000;
    const good = await auth.login({ username: 'owner', password: PASSWORD });
    expect(good.ok).toBe(true);
    const row = db.prepare('select failed_attempts, locked_until from users').get();
    expect(row).toEqual({ failed_attempts: 0, locked_until: null });
  });

  it('persists the lockout in the database, so a restart does not reset it', async () => {
    await setupOwner();
    for (let i = 0; i < 5; i++) await auth.login({ username: 'owner', password: 'bad password 1' });
    const restarted = createAuthService({ db, now, params: PARAMS });
    expect(await restarted.login({ username: 'owner', password: PASSWORD })).toMatchObject({
      ok: false,
      error: 'LOCKED',
    });
  });

  it('applies the same lockout to unknown usernames, so locking does not reveal who exists', async () => {
    await setupOwner();
    let last: unknown;
    for (let i = 0; i < 5; i++)
      last = await auth.login({ username: 'ghost', password: 'bad password 1' });
    expect(last).toEqual({ ok: false, error: 'LOCKED', retryAfterSeconds: 30 });
  });

  it('never writes the typed username or password into the audit log', async () => {
    await setupOwner();
    await auth.login({ username: 'my-secret-password-typed-here', password: 'x' });
    const dump = JSON.stringify(db.prepare('select * from audit_log').all());
    expect(dump).not.toContain('my-secret-password-typed-here');
    expect(dump).toContain('unknown_user');
  });

  it('rejects inactive users with the generic error', async () => {
    const { actor } = await setupOwner();
    const manager = await addUser(actor, 'maged', 'manager');
    await auth.deactivate(actor, manager.id);
    expect(await auth.login({ username: 'maged', password: 'shop-secret-phrase-77' })).toEqual({
      ok: false,
      error: 'INVALID_CREDENTIALS',
    });
  });

  it('upgrades a weaker stored hash after a successful login', async () => {
    await setupOwner();
    const strongerAuth = createAuthService({
      db,
      now,
      params: { password: { N: 2 ** 11, r: 8, p: 1 }, pin: CHEAP },
    });
    const before = (db.prepare('select password_hash h from users').get() as { h: string }).h;
    expect(before).toContain('$1024$');
    expect((await strongerAuth.login({ username: 'owner', password: PASSWORD })).ok).toBe(true);
    const after = (db.prepare('select password_hash h from users').get() as { h: string }).h;
    expect(after).toContain('$2048$');
    expect((await strongerAuth.login({ username: 'owner', password: PASSWORD })).ok).toBe(true);
  });
});

describe('user management and permissions', () => {
  it('lets only the owner manage users; the role is read from the database, not the caller', async () => {
    const { actor } = await setupOwner();
    const manager = await addUser(actor, 'maged', 'manager');
    const cashier = await addUser(actor, 'cairo1', 'cashier', '4821');

    const asManager = { userId: manager.id, role: 'owner' } as Actor; // forged role
    const forged = await auth.createUser(asManager, {
      username: 'evil',
      displayName: 'x',
      role: 'owner',
      password: 'evil-long-password',
    });
    expect(forged).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(await auth.deactivate({ userId: cashier.id, role: 'owner' }, manager.id)).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await auth.resetPassword(asManager, cashier.id, 'new-long-password!')).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await auth.setRole(asManager, cashier.id, 'manager')).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(db.prepare('select count(*) c from users').get()).toEqual({ c: 3 });
  });

  it('creates users who must change their first password, with unique case-insensitive names', async () => {
    const { actor } = await setupOwner();
    const user = await addUser(actor, 'Maged', 'manager');
    expect(user.mustChangePassword).toBe(true);
    const dup = await auth.createUser(actor, {
      username: 'maged',
      displayName: 'x',
      role: 'cashier',
      password: 'another-long-password',
    });
    expect(dup).toMatchObject({ ok: false, error: 'USERNAME_TAKEN' });
    const bad = await auth.createUser(actor, {
      username: 'z1x',
      displayName: 'x',
      role: 'superuser' as never,
      password: 'another-long-password',
    });
    expect(bad).toMatchObject({ ok: false, error: 'INVALID_ROLE' });
  });

  it('allows a PIN only for cashiers, validates it, and signs cashiers in by PIN', async () => {
    const { actor } = await setupOwner();
    const noPinForManager = await auth.createUser(actor, {
      username: 'maged',
      displayName: 'm',
      role: 'manager',
      password: 'shop-secret-phrase-77',
      pin: '4821',
    });
    expect(noPinForManager).toMatchObject({ ok: false, error: 'PIN_NOT_ALLOWED_FOR_ROLE' });
    const weakPin = await auth.createUser(actor, {
      username: 'cairo1',
      displayName: 'c',
      role: 'cashier',
      password: 'shop-secret-phrase-77',
      pin: '1234',
    });
    expect(weakPin).toMatchObject({ ok: false, error: 'POLICY' });

    await addUser(actor, 'cairo2', 'cashier', '٤٨٢١');
    expect(await auth.loginWithPin({ username: 'cairo2', pin: '4821' })).toMatchObject({
      ok: true,
    });
    expect(await auth.loginWithPin({ username: 'cairo2', pin: '٤٨٢١' })).toMatchObject({
      ok: true,
    });
    expect(await auth.loginWithPin({ username: 'cairo2', pin: '4822' })).toMatchObject({
      ok: false,
    });
    // managers and owners cannot sign in with a PIN even if one existed
    expect(await auth.loginWithPin({ username: 'owner', pin: '4821' })).toMatchObject({
      ok: false,
    });
  });

  it('locks PIN logins after repeated failures too', async () => {
    const { actor } = await setupOwner();
    await addUser(actor, 'cairo2', 'cashier', '4821');
    let last: unknown;
    for (let i = 0; i < 5; i++) last = await auth.loginWithPin({ username: 'cairo2', pin: '9024' });
    expect(last).toMatchObject({ ok: false, error: 'LOCKED' });
    expect(await auth.loginWithPin({ username: 'cairo2', pin: '4821' })).toMatchObject({
      ok: false,
      error: 'LOCKED',
    });
  });

  it('removes a PIN when a cashier is promoted, and reports who to sign out', async () => {
    const { actor } = await setupOwner();
    const cashier = await addUser(actor, 'cairo2', 'cashier', '4821');
    const result = await auth.setRole(actor, cashier.id, 'manager');
    expect(result).toEqual({ ok: true, value: { revokeUserId: cashier.id } });
    expect(db.prepare('select pin_hash from users where id = ?').get(cashier.id)).toEqual({
      pin_hash: null,
    });
    expect(await auth.loginWithPin({ username: 'cairo2', pin: '4821' })).toMatchObject({
      ok: false,
    });
  });

  it('protects the last active owner from demotion and deactivation', async () => {
    const { actor } = await setupOwner();
    expect(await auth.setRole(actor, actor.userId, 'manager')).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await auth.deactivate(actor, actor.userId)).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(auth.getUser(actor.userId)).toMatchObject({ role: 'owner' });
    expect(auditActions().filter((a) => a === 'user.role_change')).toEqual([]);
  });

  it('audits every management action in the same chain, and the chain verifies', async () => {
    const { actor } = await setupOwner();
    const u = await addUser(actor, 'maged', 'manager');
    await auth.resetPassword(actor, u.id, 'brand-new-password');
    await auth.setRole(actor, u.id, 'cashier');
    await auth.deactivate(actor, u.id);
    expect(auditActions()).toEqual([
      'user.create_first_owner',
      'user.create',
      'user.password_reset',
      'user.role_change',
      'user.deactivate',
    ]);
    expect(verifyAuditChain(db).ok).toBe(true);
  });
});

describe('passwords', () => {
  it('changes own password only with the current one, enforces policy, clears the forced change', async () => {
    const { actor } = await setupOwner();
    const user = await addUser(actor, 'maged', 'manager');
    const wrong = await auth.changeOwnPassword(user.id, 'not the password', 'a-brand-new-password');
    expect(wrong).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    const weak = await auth.changeOwnPassword(user.id, 'shop-secret-phrase-77', 'short');
    expect(weak).toMatchObject({ ok: false, error: 'POLICY' });
    const good = await auth.changeOwnPassword(
      user.id,
      'shop-secret-phrase-77',
      'a-brand-new-password',
    );
    expect(good).toEqual({ ok: true, value: true });
    const login = await auth.login({ username: 'maged', password: 'a-brand-new-password' });
    expect(login).toMatchObject({ ok: true, value: { mustChangePassword: false } });
    expect(
      await auth.login({ username: 'maged', password: 'shop-secret-phrase-77' }),
    ).toMatchObject({
      ok: false,
    });
  });

  it('counts wrong current-password attempts toward the lockout', async () => {
    const { actor } = await setupOwner();
    const user = await addUser(actor, 'maged', 'manager');
    let last: unknown;
    for (let i = 0; i < 5; i++)
      last = await auth.changeOwnPassword(user.id, 'bad current pw', 'a-brand-new-password');
    expect(last).toMatchObject({ ok: false, error: 'LOCKED' });
  });

  it('owner reset forces a change at next login and clears a lock', async () => {
    const { actor } = await setupOwner();
    const user = await addUser(actor, 'maged', 'manager');
    for (let i = 0; i < 5; i++) await auth.login({ username: 'maged', password: 'bad password 1' });
    expect(
      await auth.login({ username: 'maged', password: 'shop-secret-phrase-77' }),
    ).toMatchObject({
      error: 'LOCKED',
    });
    await auth.resetPassword(actor, user.id, 'temporary-password-9');
    const login = await auth.login({ username: 'maged', password: 'temporary-password-9' });
    expect(login).toMatchObject({ ok: true, value: { mustChangePassword: true } });
  });
});

describe('owner recovery key', () => {
  it('resets the owner password with the key, issues a new key, and refuses the old one', async () => {
    const { recoveryKey } = await setupOwner();
    const reset = await auth.resetOwnerWithRecoveryKey({
      username: 'owner',
      recoveryKey: recoveryKey.toLowerCase().replace(/-/g, ' '),
      newPassword: FRESH,
    });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.value.recoveryKey).not.toBe(recoveryKey);
    expect((await auth.login({ username: 'owner', password: FRESH })).ok).toBe(true);
    expect((await auth.login({ username: 'owner', password: PASSWORD })).ok).toBe(false);

    const old = await auth.resetOwnerWithRecoveryKey({
      username: 'owner',
      recoveryKey,
      newPassword: OTHER,
    });
    expect(old).toMatchObject({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(auditActions()).toContain('recovery.used');
  });

  it('locks recovery attempts after repeated wrong keys and does not work for non-owners', async () => {
    const { actor } = await setupOwner();
    await addUser(actor, 'maged', 'manager');
    expect(
      await auth.resetOwnerWithRecoveryKey({
        username: 'maged',
        recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE',
        newPassword: ANY_NEW,
      }),
    ).toMatchObject({ ok: false });
    let last: unknown;
    for (let i = 0; i < 5; i++) {
      last = await auth.resetOwnerWithRecoveryKey({
        username: 'owner',
        recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE',
        newPassword: ANY_NEW,
      });
    }
    expect(last).toMatchObject({ ok: false, error: 'LOCKED' });
    expect(await auth.login({ username: 'owner', password: PASSWORD })).toMatchObject({ ok: true });
  });

  it('refuses a weak new password without consuming the key', async () => {
    const { recoveryKey } = await setupOwner();
    const weak = await auth.resetOwnerWithRecoveryKey({
      username: 'owner',
      recoveryKey,
      newPassword: 'short',
    });
    expect(weak).toMatchObject({ ok: false, error: 'POLICY' });
    const ok = await auth.resetOwnerWithRecoveryKey({
      username: 'owner',
      recoveryKey,
      newPassword: FRESH,
    });
    expect(ok.ok).toBe(true);
  });
});
