import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionStore, type SessionStore } from '../../src/application/auth/session-store';
import { rolePermissions } from '../../src/domain/permissions';
import { createAuthService } from '../../src/infrastructure/auth/auth-service';
import { appendAudit } from '../../src/infrastructure/db/audit-log';
import { loadMigrations } from '../../src/infrastructure/db/migrations/load';
import { migrate } from '../../src/infrastructure/db/migrations/runner';
import { openDatabase, type Db } from '../../src/infrastructure/db/open';
import { registerAuthHandlers } from '../../src/main/ipc/auth-handlers';
import { registerHandlers } from '../../src/main/ipc/handlers';
import { createIpcRegistry, type IpcRegistry } from '../../src/main/ipc/registry';
import { channelNames, ipcContract } from '../../src/shared/contracts/ipc';

const TRUSTED = 'file:///app/index.html';
const CHEAP = { N: 2 ** 10, r: 8, p: 1 };
const STRONG_PW = 'correct horse battery';
const SHOP_PW = 'shop-secret-phrase-77';

let dir: string;
let db: Db;
let sessions: SessionStore;
let registry: IpcRegistry;

/** Calls a channel as window `window` and returns the transport result. */
const call = (channel: string, payload: unknown, windowId = 1, url = TRUSTED) =>
  registry.invoke(channel, { senderUrl: url, senderId: windowId }, payload);

/** Unwraps the transport envelope and returns the service result inside. */
async function inner(channel: string, payload: unknown, windowId = 1) {
  const result = await call(channel, payload, windowId);
  if (!result.ok) throw new Error(`transport error ${result.error.code} on ${channel}`);
  return result.data as { ok: boolean; value?: Record<string, unknown>; error?: string };
}

const auditActions = () =>
  (db.prepare('select action from audit_log order by id').all() as { action: string }[]).map(
    (r) => r.action,
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hesban-ipcauth-'));
  db = openDatabase({ file: join(dir, 'a.db'), keyHex: randomBytes(32).toString('hex') });
  migrate(db, loadMigrations());
  sessions = createSessionStore();
  const auth = createAuthService({ db, params: { password: CHEAP, pin: CHEAP } });
  registry = createIpcRegistry({
    isTrustedSender: (url) => url === TRUSTED,
    getActor: (event) => {
      const s = sessions.touch(event.senderId ?? -1);
      return s ? { userId: s.userId, permissions: rolePermissions[s.role] } : null;
    },
    log: () => {},
    onDenied: ({ channel, code, senderId }) => {
      appendAudit(db, {
        actorId: sessions.touch(senderId)?.userId ?? null,
        action: 'permission.denied',
        details: { channel, code },
      });
    },
  });
  registerHandlers(registry, 'test');
  registerAuthHandlers(registry, { db, auth, sessions });
});

afterEach(() => {
  if (db.open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function setupOwnerAndCashier() {
  const setup = await inner('auth:setup', {
    username: 'owner',
    displayName: 'مالك',
    password: STRONG_PW,
  });
  expect(setup.ok).toBe(true);
  const created = await inner('users:create', {
    username: 'cashier1',
    displayName: 'كاشير',
    role: 'cashier',
    password: SHOP_PW,
    pin: '4821',
  });
  expect(created.ok).toBe(true);
  await inner('auth:logout', {});
}

describe('registration', () => {
  it('every contract channel has exactly one handler', () => {
    expect(() => registry.assertComplete()).not.toThrow();
    expect(registry.channels()).toEqual([...channelNames].sort());
    expect(channelNames.length).toBe(Object.keys(ipcContract).length);
  });
});

describe('first run and sessions', () => {
  it('starts without users, logs the owner in on setup, and ends the session on logout', async () => {
    expect(await inner('auth:status', {})).toMatchObject({ hasUsers: false, user: null });
    const setup = await inner('auth:setup', {
      username: 'owner',
      displayName: 'مالك',
      password: STRONG_PW,
    });
    expect(setup).toMatchObject({ ok: true, value: { user: { role: 'owner' } } });
    expect(String(setup.value?.['recoveryKey'])).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);

    expect(await inner('auth:status', {})).toMatchObject({
      hasUsers: true,
      user: { username: 'owner' },
    });
    await inner('auth:logout', {});
    expect(await inner('auth:status', {})).toMatchObject({ hasUsers: true, user: null });
  });

  it('refuses a second setup and ignores a setup attempt after the first user exists', async () => {
    await setupOwnerAndCashier();
    const again = await inner(
      'auth:setup',
      { username: 'second', displayName: 'x', password: STRONG_PW },
      2,
    );
    expect(again).toMatchObject({ ok: false, error: 'FIRST_RUN_ALREADY_DONE' });
    expect(await inner('auth:status', {}, 2)).toMatchObject({ user: null });
  });

  it('binds sessions to the window: one window logging in does not sign in another', async () => {
    await setupOwnerAndCashier();
    expect((await inner('auth:login', { username: 'owner', password: STRONG_PW }, 1)).ok).toBe(
      true,
    );
    expect(await inner('auth:status', {}, 1)).toMatchObject({ user: { username: 'owner' } });
    expect(await inner('auth:status', {}, 2)).toMatchObject({ user: null });
    const denied = await call('users:list', {}, 2);
    expect(denied).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});

describe('authorisation at the IPC boundary', () => {
  it('rejects protected channels without a session (UNAUTHENTICATED) and audits it', async () => {
    await setupOwnerAndCashier();
    for (const channel of ['users:list', 'audit:verify']) {
      const r = await call(channel, {});
      expect(r, channel).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }
    const changePw = await call('auth:change-password', { current: 'a', next: 'b' });
    expect(changePw).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    expect(auditActions().filter((a) => a === 'permission.denied').length).toBe(3);
  });

  it('refuses every owner channel for a cashier (FORBIDDEN), changes nothing, and audits who tried', async () => {
    await setupOwnerAndCashier();
    expect((await inner('auth:login-pin', { username: 'cashier1', pin: '4821' })).ok).toBe(true);
    const usersBefore = db.prepare('select count(*) c from users').get();

    const attempts: Array<[string, unknown]> = [
      ['users:list', {}],
      ['users:create', { username: 'evil1', displayName: 'x', role: 'owner', password: SHOP_PW }],
      ['users:reset-password', { userId: 1, newPassword: 'a-new-secret-phrase-5' }],
      ['users:set-role', { userId: 2, role: 'owner' }],
      ['users:deactivate', { userId: 1 }],
      ['audit:verify', {}],
    ];
    for (const [channel, payload] of attempts) {
      expect(await call(channel, payload), channel).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
    }
    expect(db.prepare('select count(*) c from users').get()).toEqual(usersBefore);
    const denials = db
      .prepare("select actor_id, details_json from audit_log where action = 'permission.denied'")
      .all() as { actor_id: number; details_json: string }[];
    expect(denials).toHaveLength(attempts.length);
    expect(new Set(denials.map((d) => d.actor_id))).toEqual(new Set([2]));
    expect(JSON.parse(denials[0]?.details_json ?? '{}')).toEqual({
      channel: 'users:list',
      code: 'FORBIDDEN',
    });
  });

  it('lets the owner manage users and verify the audit chain', async () => {
    await setupOwnerAndCashier();
    await inner('auth:login', { username: 'owner', password: STRONG_PW });
    const list = await inner('users:list', {});
    expect((list as unknown as { users: unknown[] }).users).toHaveLength(2);
    const verdict = (await call('audit:verify', {})) as {
      ok: true;
      data: { ok: boolean; rows: number };
    };
    expect(verdict.data).toMatchObject({ ok: true });
    expect(verdict.data.rows).toBeGreaterThanOrEqual(3);
  });

  it("ends a user's sessions when their role changes, they are reset or deactivated", async () => {
    await setupOwnerAndCashier();
    // cashier signs in on window 2, owner on window 1
    await inner('auth:login-pin', { username: 'cashier1', pin: '4821' }, 2);
    await inner('auth:login', { username: 'owner', password: STRONG_PW }, 1);
    expect(await inner('auth:status', {}, 2)).toMatchObject({ user: { username: 'cashier1' } });

    const changed = await inner('users:set-role', { userId: 2, role: 'manager' }, 1);
    expect(changed.ok).toBe(true);
    expect(await inner('auth:status', {}, 2)).toMatchObject({ user: null });

    await inner('auth:login', { username: 'cashier1', password: SHOP_PW }, 2);
    expect(await inner('auth:status', {}, 2)).toMatchObject({ user: { role: 'manager' } });
    expect((await inner('users:deactivate', { userId: 2 }, 1)).ok).toBe(true);
    expect(await inner('auth:status', {}, 2)).toMatchObject({ user: null });
  });

  it('protects the last owner through the IPC path too', async () => {
    await setupOwnerAndCashier();
    await inner('auth:login', { username: 'owner', password: STRONG_PW });
    expect(await inner('users:deactivate', { userId: 1 })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await inner('users:set-role', { userId: 1, role: 'cashier' })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
  });
});

describe('input and output hygiene', () => {
  it('rejects malformed payloads before any service runs', async () => {
    const bad: Array<[string, unknown]> = [
      ['auth:login', { username: 'ab', password: 'x' }],
      ['auth:login', { username: 'owner', password: 'x', extra: true }],
      ['auth:login', { username: 'a'.repeat(65), password: 'x' }],
      ['auth:login', { username: 'owner', password: 'x'.repeat(129) }],
      ['auth:setup', { username: 'owner', displayName: '   ', password: STRONG_PW }],
      ['users:create', { username: 'abc', displayName: 'x', role: 'root', password: 'p' }],
      ['users:set-role', { userId: -1, role: 'owner' }],
      ['users:set-role', { userId: 1.5, role: 'owner' }],
      ['auth:login-pin', { username: 'owner', pin: '' }],
      ['auth:logout', { force: true }],
    ];
    for (const [channel, payload] of bad) {
      expect(await call(channel, payload), `${channel} ${JSON.stringify(payload)}`).toMatchObject({
        ok: false,
        error: { code: 'INVALID_INPUT' },
      });
    }
    expect(db.prepare('select count(*) c from users').get()).toEqual({ c: 0 });
  });

  it('refuses callers that are not the app page', async () => {
    for (const url of ['https://evil.test/', 'file:///other.html', '']) {
      expect(await call('auth:status', {}, 1, url)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_SENDER' },
      });
    }
  });

  it('never returns password hashes, PIN hashes or recovery hashes in any response', async () => {
    await setupOwnerAndCashier();
    await inner('auth:login', { username: 'owner', password: STRONG_PW });
    const responses = [
      await call('auth:status', {}),
      await call('users:list', {}),
      await call('auth:login', { username: 'owner', password: STRONG_PW }),
      await call('users:create', {
        username: 'maged1',
        displayName: 'm',
        role: 'manager',
        password: SHOP_PW,
      }),
    ];
    const text = JSON.stringify(responses);
    expect(text).not.toMatch(/scrypt\$/);
    expect(text).not.toMatch(/password_hash|pin_hash|recovery/i);
  });

  it('reports lockout details to the caller and keeps them out of the audit text', async () => {
    await setupOwnerAndCashier();
    let last: { ok: boolean; error?: string } = { ok: true };
    for (let i = 0; i < 5; i++) {
      last = await inner('auth:login', { username: 'owner', password: 'wrong password 1' });
    }
    expect(last).toMatchObject({ ok: false, error: 'LOCKED' });
    const r = (await call('auth:login', { username: 'owner', password: STRONG_PW })) as {
      ok: true;
      data: { retryAfterSeconds: number };
    };
    expect(r.data.retryAfterSeconds).toBeGreaterThan(0);
    expect(JSON.stringify(db.prepare('select * from audit_log').all())).not.toContain(
      'wrong password 1',
    );
  });
});
