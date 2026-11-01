import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDatabase, type AppDatabase } from '../../src/infrastructure/db/database-service';
import {
  DB_FILE,
  KEY_FILE,
  KeyStoreError,
  loadOrCreateDbKey,
  type KeyWrapper,
} from '../../src/infrastructure/db/key-store';

/** Stand-in for DPAPI: authenticated encryption under a per-"Windows user" secret. */
function fakeWrapper(userSecret: Buffer = randomBytes(32), reWrapOnce = false): KeyWrapper {
  let reWrap = reWrapOnce;
  return {
    wrap(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', userSecret, iv);
      const body = Buffer.concat([c.update(plain), c.final()]);
      return Promise.resolve(Buffer.concat([iv, c.getAuthTag(), body]));
    },
    unwrap(blob) {
      try {
        const d = createDecipheriv('aes-256-gcm', userSecret, blob.subarray(0, 12));
        d.setAuthTag(blob.subarray(12, 28));
        const plain = Buffer.concat([d.update(blob.subarray(28)), d.final()]);
        const shouldReWrap = reWrap;
        reWrap = false;
        return Promise.resolve({ plain, shouldReWrap });
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
}

let dir: string;
const open: AppDatabase[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hesban-dbsvc-'));
});

afterEach(() => {
  for (const d of open.splice(0)) d.close();
  rmSync(dir, { recursive: true, force: true });
});

async function openDb(wrapper: KeyWrapper): Promise<AppDatabase> {
  const database = await openAppDatabase({ dir, wrapper });
  open.push(database);
  return database;
}

describe('key store', () => {
  it('creates a random 256-bit key on first run and stores it wrapped, never in plain text', async () => {
    const wrapper = fakeWrapper();
    const first = await loadOrCreateDbKey(dir, wrapper);
    expect(first.created).toBe(true);
    expect(first.keyHex).toMatch(/^[0-9a-f]{64}$/);
    const blob = readFileSync(join(dir, KEY_FILE));
    expect(blob.includes(Buffer.from(first.keyHex))).toBe(false);
    expect(blob.includes(Buffer.from(first.keyHex, 'hex'))).toBe(false);

    const again = await loadOrCreateDbKey(dir, wrapper);
    expect(again).toEqual({ keyHex: first.keyHex, created: false });
  });

  it('generates a different key for every installation', async () => {
    const a = await loadOrCreateDbKey(join(dir, 'a'), fakeWrapper());
    const b = await loadOrCreateDbKey(join(dir, 'b'), fakeWrapper());
    expect(a.keyHex).not.toBe(b.keyHex);
  });

  it('never creates a new key next to an existing database', async () => {
    writeFileSync(join(dir, DB_FILE), 'pretend database');
    await expect(loadOrCreateDbKey(dir, fakeWrapper())).rejects.toMatchObject({
      code: 'KEY_MISSING_FOR_EXISTING_DATABASE',
    });
    expect(existsSync(join(dir, KEY_FILE))).toBe(false);
  });

  it('reports an unreadable key (another Windows user, damaged file) without leaking details', async () => {
    await loadOrCreateDbKey(dir, fakeWrapper(Buffer.alloc(32, 1)));
    const error = await loadOrCreateDbKey(dir, fakeWrapper(Buffer.alloc(32, 2))).catch((e) => e);
    expect(error).toBeInstanceOf(KeyStoreError);
    expect(error.code).toBe('KEY_UNREADABLE');
    expect(error.message).not.toMatch(/[0-9a-f]{64}/);

    const keyPath = join(dir, KEY_FILE);
    const damaged = readFileSync(keyPath);
    damaged.writeUInt8(damaged.readUInt8(damaged.length - 1) ^ 1, damaged.length - 1);
    writeFileSync(keyPath, damaged);
    await expect(loadOrCreateDbKey(dir, fakeWrapper(Buffer.alloc(32, 1)))).rejects.toMatchObject({
      code: 'KEY_UNREADABLE',
    });
  });

  it('rejects an unwrapped key of the wrong length', async () => {
    const wrapper: KeyWrapper = {
      wrap: () => Promise.resolve(Buffer.from('x')),
      unwrap: () => Promise.resolve({ plain: Buffer.alloc(16), shouldReWrap: false }),
    };
    await loadOrCreateDbKey(dir, wrapper);
    await expect(loadOrCreateDbKey(dir, wrapper)).rejects.toMatchObject({ code: 'KEY_INVALID' });
  });

  it('re-wraps the key when the platform asks for it, keeping the same key', async () => {
    const secret = randomBytes(32);
    const first = await loadOrCreateDbKey(dir, fakeWrapper(secret));
    const before = readFileSync(join(dir, KEY_FILE));
    const again = await loadOrCreateDbKey(dir, fakeWrapper(secret, true));
    expect(again.keyHex).toBe(first.keyHex);
    expect(readFileSync(join(dir, KEY_FILE)).equals(before)).toBe(false);
    expect((await loadOrCreateDbKey(dir, fakeWrapper(secret))).keyHex).toBe(first.keyHex);
  });

  it('leaves no temp file behind', async () => {
    await loadOrCreateDbKey(dir, fakeWrapper());
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('application database service', () => {
  it('creates an encrypted database with all migrations on first run', async () => {
    const database = await openDb(fakeWrapper());
    expect(database.keyCreated).toBe(true);
    expect(database.migration.current).toBeGreaterThanOrEqual(2);
    expect(database.migration.applied.length).toBe(database.migration.current);
    database.close();
    const header = readFileSync(join(dir, DB_FILE)).subarray(0, 15).toString('latin1');
    expect(header).not.toBe('SQLite format 3');
  });

  it('reopens with the stored key and applies nothing again', async () => {
    const secret = randomBytes(32);
    const first = await openDb(fakeWrapper(secret));
    first.db.prepare("insert into app_meta(key, value) values ('x', 'y')").run();
    first.close();
    const second = await openDb(fakeWrapper(secret));
    expect(second.keyCreated).toBe(false);
    expect(second.migration.applied).toEqual([]);
    expect(second.db.prepare("select value from app_meta where key = 'x'").get()).toEqual({
      value: 'y',
    });
  });

  it('refuses to open when the key cannot be unwrapped and does not lock the database file', async () => {
    (await openDb(fakeWrapper(Buffer.alloc(32, 7)))).close();
    await expect(openDb(fakeWrapper(Buffer.alloc(32, 8)))).rejects.toMatchObject({
      code: 'KEY_UNREADABLE',
    });
    // A leaked handle would make this fail on Windows.
    rmSync(join(dir, DB_FILE));
    expect(existsSync(join(dir, DB_FILE))).toBe(false);
  });

  it('refuses a database whose key file was deleted', async () => {
    (await openDb(fakeWrapper())).close();
    rmSync(join(dir, KEY_FILE));
    await expect(openDb(fakeWrapper())).rejects.toMatchObject({
      code: 'KEY_MISSING_FOR_EXISTING_DATABASE',
    });
  });

  it('closes the handle when a migration fails', async () => {
    await expect(
      openAppDatabase({
        dir,
        wrapper: fakeWrapper(),
        migrations: [{ version: 1, name: 'bad', sql: 'select * from missing_table;' }],
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
    rmSync(join(dir, DB_FILE));
    expect(existsSync(join(dir, DB_FILE))).toBe(false);
  });

  it('runs the backup hook before changing an existing database', async () => {
    const secret = randomBytes(32);
    const migrations = [
      { version: 1, name: 'one', sql: 'create table a (id integer primary key) strict;' },
      { version: 2, name: 'two', sql: 'create table b (id integer primary key) strict;' },
    ];
    const first = await openAppDatabase({
      dir,
      wrapper: fakeWrapper(secret),
      migrations: migrations.slice(0, 1),
    });
    first.close();
    const calls: unknown[] = [];
    const second = await openAppDatabase({
      dir,
      wrapper: fakeWrapper(secret),
      migrations,
      beforeMigrate: (c) => calls.push(c),
    });
    open.push(second);
    expect(calls).toEqual([{ fromVersion: 1, toVersion: 2 }]);
  });
});
