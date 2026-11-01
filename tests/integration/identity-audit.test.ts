import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GENESIS_HASH,
  appendAudit,
  canonicalJson,
  verifyAuditChain,
} from '../../src/infrastructure/db/audit-log';
import { loadMigrations } from '../../src/infrastructure/db/migrations/load';
import { migrate } from '../../src/infrastructure/db/migrations/runner';
import { openDatabase, type Db } from '../../src/infrastructure/db/open';

let dir: string;
let db: Db;
const NOW = new Date('2026-11-01T12:00:00.000Z');

function addUser(username: string, role: 'owner' | 'manager' | 'cashier', active = 1): number {
  const result = db
    .prepare(
      `insert into users(uuid, username, display_name, role, password_hash, is_active, created_at, updated_at)
       values (?, ?, ?, ?, 'hash', ?, ?, ?)`,
    )
    .run(
      randomBytes(8).toString('hex'),
      username,
      username,
      role,
      active,
      NOW.toISOString(),
      NOW.toISOString(),
    );
  return Number(result.lastInsertRowid);
}

function failsWith(sql: string, message: RegExp, ...params: unknown[]) {
  expect(() => db.prepare(sql).run(...params)).toThrow(message);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hesban-idaud-'));
  db = openDatabase({ file: join(dir, 'a.db'), keyHex: randomBytes(32).toString('hex') });
  migrate(db, loadMigrations());
});

afterEach(() => {
  if (db.open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('users table', () => {
  it('enforces roles, unique case-insensitive usernames and strict types', () => {
    addUser('Ahmed', 'cashier');
    expect(() => addUser('ahmed', 'manager')).toThrow(/UNIQUE/);
    expect(() =>
      db
        .prepare(
          `insert into users(uuid, username, display_name, role, password_hash, created_at, updated_at)
           values ('u', 'x', 'x', 'superuser', 'h', 't', 't')`,
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it('never allows deleting a user', () => {
    const id = addUser('owner1', 'owner');
    failsWith('delete from users where id = ?', /cannot be deleted/, id);
  });

  it('protects the last active owner from demotion and deactivation', () => {
    const owner = addUser('owner1', 'owner');
    failsWith("update users set role = 'manager' where id = ?", /last active owner/, owner);
    failsWith('update users set is_active = 0 where id = ?', /last active owner/, owner);

    const second = addUser('owner2', 'owner');
    db.prepare("update users set role = 'manager' where id = ?").run(owner);
    failsWith('update users set is_active = 0 where id = ?', /last active owner/, second);
  });

  it('lets other users change freely and an inactive owner stay inactive', () => {
    addUser('owner1', 'owner');
    const cashier = addUser('c1', 'cashier');
    db.prepare("update users set role = 'manager', is_active = 0 where id = ?").run(cashier);
    const inactiveOwner = addUser('owner0', 'owner', 0);
    db.prepare("update users set role = 'cashier' where id = ?").run(inactiveOwner);
  });
});

describe('audit log', () => {
  it('chains entries from GENESIS and verifies', () => {
    expect(verifyAuditChain(db)).toEqual({ ok: true, rows: 0, head: GENESIS_HASH });
    const a = appendAudit(
      db,
      { actorId: null, action: 'login.failed', details: { user: 'x' } },
      () => NOW,
    );
    const b = appendAudit(db, { actorId: null, action: 'login.ok' }, () => NOW);
    expect(a.hash).not.toBe(b.hash);
    const rows = db.prepare('select prev_hash, hash from audit_log order by id').all();
    expect(rows).toEqual([
      { prev_hash: GENESIS_HASH, hash: a.hash },
      { prev_hash: a.hash, hash: b.hash },
    ]);
    expect(verifyAuditChain(db)).toEqual({ ok: true, rows: 2, head: b.hash });
  });

  it('hashes canonical JSON: key order does not change the hash input', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,2]},"b":1}',
    );
    const one = appendAudit(db, { actorId: null, action: 'x', details: { a: 1, b: 2 } }, () => NOW);
    const row = db.prepare('select details_json from audit_log where id = ?').get(one.id);
    expect(row).toEqual({ details_json: '{"a":1,"b":2}' });
  });

  it('refuses updates, deletes and a wrong chain link at the database level', () => {
    const entry = appendAudit(db, { actorId: null, action: 'a' }, () => NOW);
    failsWith("update audit_log set action = 'b' where id = ?", /immutable/, entry.id);
    failsWith('delete from audit_log where id = ?', /immutable/, entry.id);
    failsWith(
      `insert into audit_log(at, action, prev_hash, hash) values ('t', 'x', 'WRONG', 'h1')`,
      /chain link/,
    );
    failsWith(
      `insert into audit_log(at, action, prev_hash, hash) values ('t', 'x', 'GENESIS', 'h2')`,
      /chain link/,
    );
    expect(verifyAuditChain(db).ok).toBe(true);
  });

  it('detects tampering made with the triggers removed (edit, delete, insert, reorder)', () => {
    for (let i = 0; i < 4; i++) appendAudit(db, { actorId: null, action: `a${i}` }, () => NOW);
    const triggers = ['audit_no_update', 'audit_no_delete', 'audit_chain_link'];
    const snapshot = db
      .prepare("select sql from sqlite_master where type = 'trigger' and name in (?, ?, ?)")
      .all(...triggers) as { sql: string }[];
    for (const t of triggers) db.exec(`drop trigger ${t}`);

    // edit
    db.prepare("update audit_log set action = 'forged' where id = 2").run();
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, brokenAtId: 2 });
    db.prepare("update audit_log set action = 'a1' where id = 2").run();
    expect(verifyAuditChain(db).ok).toBe(true);

    // delete a middle row
    const saved = db.prepare('select * from audit_log where id = 3').get() as Record<
      string,
      unknown
    >;
    db.prepare('delete from audit_log where id = 3').run();
    expect(verifyAuditChain(db)).toMatchObject({ ok: false, brokenAtId: 4 });

    // re-insert at the same position restores it
    db.prepare(
      'insert into audit_log(id, at, actor_id, action, entity_type, entity_id, details_json, prev_hash, hash) values (@id, @at, @actor_id, @action, @entity_type, @entity_id, @details_json, @prev_hash, @hash)',
    ).run(saved);
    expect(verifyAuditChain(db).ok).toBe(true);

    // forged row with a recomputed-looking but wrong hash
    db.prepare(
      "insert into audit_log(at, action, prev_hash, hash) values ('t', 'x', (select hash from audit_log order by id desc limit 1), 'deadbeef')",
    ).run();
    expect(verifyAuditChain(db)).toMatchObject({ ok: false });

    for (const s of snapshot) db.exec(s.sql);
  });

  it('commits or rolls back together with the action it records', () => {
    const tx = db.transaction(() => {
      addUser('temp', 'cashier');
      appendAudit(db, { actorId: null, action: 'user.create' }, () => NOW);
      throw new Error('abort');
    });
    expect(() => tx()).toThrow('abort');
    expect(db.prepare('select count(*) c from audit_log').get()).toEqual({ c: 0 });
    expect(db.prepare('select count(*) c from users').get()).toEqual({ c: 0 });
  });
});

describe('command log', () => {
  it('rejects a repeated command id and any change after insert', () => {
    const insert = () =>
      db
        .prepare(
          "insert into command_log(command_id, command_type, result_json, created_at) values ('c1', 'sale.post', '{}', 't')",
        )
        .run();
    insert();
    expect(insert).toThrow(/UNIQUE/);
    failsWith("update command_log set result_json = '{}' where command_id = 'c1'", /immutable/);
    failsWith("delete from command_log where command_id = 'c1'", /immutable/);
  });
});
