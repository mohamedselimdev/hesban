import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../../src/infrastructure/db/open';
import { loadMigrations } from '../../src/infrastructure/db/migrations/load';
import {
  MigrationError,
  checksumOf,
  migrate,
  type Migration,
} from '../../src/infrastructure/db/migrations/runner';

const m1: Migration = {
  version: 1,
  name: 'one',
  sql: 'create table a (id integer primary key) strict;',
};
const m2: Migration = {
  version: 2,
  name: 'two',
  sql: 'create table b (id integer primary key) strict; insert into a(id) values (1);',
};
const m3Bad: Migration = {
  version: 3,
  name: 'three_bad',
  sql: 'create table c (id integer primary key) strict; select * from table_that_does_not_exist;',
};

let dir: string;
let dbs: Db[];

function open(file = 'test.db', keyHex?: string): Db {
  const db = openDatabase(keyHex ? { file: join(dir, file), keyHex } : { file: join(dir, file) });
  dbs.push(db);
  return db;
}

function tables(db: Db): string[] {
  return (
    db.prepare("select name from sqlite_master where type='table' order by name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof MigrationError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hesban-mig-'));
  dbs = [];
});

afterEach(() => {
  for (const db of dbs) if (db.open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('migration runner', () => {
  it('applies all migrations to an empty database and records history', () => {
    const db = open();
    const result = migrate(db, [m1, m2]);
    expect(result).toEqual({ applied: [1, 2], current: 2 });
    expect(tables(db)).toEqual(['a', 'b', 'schema_migrations']);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    const rows = db
      .prepare('select version, name, checksum from schema_migrations order by version')
      .all();
    expect(rows).toEqual([
      { version: 1, name: 'one', checksum: checksumOf(m1.sql) },
      { version: 2, name: 'two', checksum: checksumOf(m2.sql) },
    ]);
  });

  it('is idempotent: a second run applies nothing', () => {
    const db = open();
    migrate(db, [m1, m2]);
    expect(migrate(db, [m1, m2])).toEqual({ applied: [], current: 2 });
    expect(db.prepare('select count(*) c from schema_migrations').get()).toEqual({ c: 2 });
  });

  it('upgrades from every earlier schema version', () => {
    const all = [m1, m2];
    for (let k = 0; k <= all.length; k++) {
      const db = open(`from-${k}.db`);
      migrate(db, all.slice(0, k));
      const result = migrate(db, all);
      expect(result.current, `from ${k}`).toBe(2);
      expect(result.applied, `from ${k}`).toEqual(all.slice(k).map((m) => m.version));
    }
  });

  it('refuses a changed migration after it was applied (checksum mismatch)', () => {
    const db = open();
    migrate(db, [m1]);
    const tampered = { ...m1, sql: 'create table a (id integer primary key, evil text) strict;' };
    expect(codeOf(() => migrate(db, [tampered, m2]))).toBe('CHECKSUM_MISMATCH');
    expect(tables(db)).toEqual(['a', 'schema_migrations']);
  });

  it('rolls back everything when a later migration fails', () => {
    const db = open();
    migrate(db, [m1]);
    expect(codeOf(() => migrate(db, [m1, m2, m3Bad]))).toBe('MIGRATION_FAILED');
    expect(tables(db)).toEqual(['a', 'schema_migrations']);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.prepare('select count(*) c from schema_migrations').get()).toEqual({ c: 1 });
    expect(db.prepare('select count(*) c from a').get()).toEqual({ c: 0 });
  });

  it('leaves a fresh database empty of migrations when the first one fails', () => {
    const db = open();
    const bad = { ...m3Bad, version: 1 };
    expect(codeOf(() => migrate(db, [bad]))).toBe('MIGRATION_FAILED');
    expect(tables(db)).toEqual(['schema_migrations']);
    expect(db.pragma('user_version', { simple: true })).toBe(0);
  });

  it('refuses a database that is newer than the app', () => {
    const db = open();
    migrate(db, [m1, m2]);
    expect(codeOf(() => migrate(db, [m1]))).toBe('NEWER_SCHEMA');
  });

  it('detects user_version that disagrees with the history', () => {
    const db = open();
    migrate(db, [m1, m2]);
    db.pragma('user_version = 7');
    expect(codeOf(() => migrate(db, [m1, m2]))).toBe('VERSION_MISMATCH');
  });

  it('rejects malformed migration lists', () => {
    const db = open();
    const cases: Migration[][] = [
      [{ ...m1, version: 2 }],
      [m1, { ...m2, version: 3 }],
      [m1, { ...m1 }],
      [m2, m1],
      [{ ...m1, version: 0 }],
      [{ ...m1, version: 1.5 }],
      [{ ...m1, sql: '   ' }],
      [{ ...m1, name: '' }],
    ];
    for (const list of cases) {
      expect(
        codeOf(() => migrate(db, list)),
        JSON.stringify(list.map((m) => m.version)),
      ).toBe('INVALID_MIGRATION_LIST');
    }
    expect(tables(db)).toEqual([]);
  });

  it('treats CRLF and LF migration text as the same checksum', () => {
    const db = open();
    migrate(db, [m1]);
    const crlf = { ...m1, sql: m1.sql.replace(/\n/g, '\r\n') };
    expect(checksumOf(m1.sql)).toBe(checksumOf(crlf.sql));
    expect(migrate(db, [crlf])).toEqual({ applied: [], current: 1 });
    const multi = { ...m1, sql: 'create table a (\n  id integer primary key\n) strict;\n' };
    expect(checksumOf(multi.sql)).toBe(checksumOf(multi.sql.replace(/\n/g, '\r\n')));
  });

  describe('pre-migration backup hook', () => {
    it('is not called for a fresh database', () => {
      const db = open();
      const calls: unknown[] = [];
      migrate(db, [m1, m2], { beforeMigrate: (c) => calls.push(c) });
      expect(calls).toEqual([]);
    });

    it('is called once with versions for an existing database with pending work', () => {
      const db = open();
      migrate(db, [m1]);
      const calls: unknown[] = [];
      migrate(db, [m1, m2], { beforeMigrate: (c) => calls.push(c) });
      expect(calls).toEqual([{ fromVersion: 1, toVersion: 2 }]);
    });

    it('is not called when nothing is pending', () => {
      const db = open();
      migrate(db, [m1, m2]);
      const calls: unknown[] = [];
      migrate(db, [m1, m2], { beforeMigrate: (c) => calls.push(c) });
      expect(calls).toEqual([]);
    });

    it('aborts the migration, changing nothing, when the backup fails', () => {
      const db = open();
      migrate(db, [m1]);
      const code = codeOf(() =>
        migrate(db, [m1, m2], {
          beforeMigrate: () => {
            throw new Error('disk full');
          },
        }),
      );
      expect(code).toBe('BACKUP_FAILED');
      expect(tables(db)).toEqual(['a', 'schema_migrations']);
      expect(db.pragma('user_version', { simple: true })).toBe(1);
    });
  });
});

describe('shipped migration files', () => {
  it('are numbered 1..n without gaps and create the 0001 tables', () => {
    const list = loadMigrations();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.map((m) => m.version)).toEqual(list.map((_, i) => i + 1));
    const db = open('real.db');
    const result = migrate(db, list);
    expect(result.current).toBe(list.length);
    expect(tables(db)).toEqual(
      expect.arrayContaining(['app_meta', 'schema_migrations', 'settings']),
    );
    expect(migrate(db, list).applied).toEqual([]);
  });

  it('create STRICT tables only', () => {
    const db = open('strict.db');
    migrate(db, loadMigrations());
    const rows = db
      .prepare("select name, strict from pragma_table_list where schema='main'")
      .all() as {
      name: string;
      strict: number;
    }[];
    const own = rows.filter((r) => !r.name.startsWith('sqlite_'));
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((r) => r.strict !== 1).map((r) => r.name)).toEqual([]);
  });
});

describe('encrypted database', () => {
  const keyHex = randomBytes(32).toString('hex');

  it('migrates, reopens with the key, and refuses a wrong key without leaving the file locked', () => {
    const file = 'enc.db';
    const first = open(file, keyHex);
    migrate(first, loadMigrations());
    first.close();

    const again = open(file, keyHex);
    expect(migrate(again, loadMigrations()).applied).toEqual([]);
    again.close();

    expect(() => open(file, randomBytes(32).toString('hex'))).toThrow();
    expect(() => open(file)).toThrow();
    // A leaked handle would make this fail with EPERM on Windows.
    rmSync(join(dir, file));
    expect(existsSync(join(dir, file))).toBe(false);
  });

  it('rolls back on failure inside an encrypted database too', () => {
    const db = open('enc2.db', keyHex);
    migrate(db, [m1]);
    expect(codeOf(() => migrate(db, [m1, m2, m3Bad]))).toBe('MIGRATION_FAILED');
    expect(tables(db)).toEqual(['a', 'schema_migrations']);
  });

  it('rejects malformed keys before they reach a PRAGMA', () => {
    for (const bad of [
      '',
      'zz',
      'a'.repeat(63),
      'a'.repeat(65),
      `${'a'.repeat(62)}'"`,
      "x'; drop",
    ]) {
      expect(() => openDatabase({ file: join(dir, 'k.db'), keyHex: bad }), bad).toThrow(
        'database key must be 64 hex characters',
      );
    }
    expect(existsSync(join(dir, 'k.db'))).toBe(false);
  });
});
