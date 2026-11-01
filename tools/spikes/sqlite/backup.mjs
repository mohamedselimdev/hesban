import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newKeyHex, open } from './lib.mjs';

const MAGIC = Buffer.from('HBK1');
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

function makeBackup(db, dbKeyHex, passphrase, outFile, tmp) {
  const copy = join(tmp, 'vacuum-copy.db');
  db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  const payload = Buffer.concat([Buffer.from(dbKeyHex, 'hex'), readFileSync(copy)]);
  rmSync(copy);
  const salt = randomBytes(16), nonce = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const header = Buffer.concat([MAGIC, salt, nonce]);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(header);
  const body = Buffer.concat([c.update(payload), c.final()]);
  writeFileSync(outFile, Buffer.concat([header, body, c.getAuthTag()]));
}

function readBackup(file, passphrase) {
  const buf = readFileSync(file);
  const header = buf.subarray(0, 32);
  if (!header.subarray(0, 4).equals(MAGIC)) throw new Error('bad magic');
  const salt = header.subarray(4, 20), nonce = header.subarray(20, 32);
  const tag = buf.subarray(buf.length - 16);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const d = createDecipheriv('aes-256-gcm', key, nonce);
  d.setAAD(header);
  d.setAuthTag(tag);
  const payload = Buffer.concat([d.update(buf.subarray(32, buf.length - 16)), d.final()]);
  return { dbKeyHex: payload.subarray(0, 32).toString('hex'), db: payload.subarray(32) };
}

const dir = mkdtempSync(join(tmpdir(), 'hesban-bk-'));
const r = {};
const key = newKeyHex();
const src = open(join(dir, 'src.db'), { hexKey: key });
src.exec('create table inv (id integer primary key, total_pt integer not null) strict');
const ins = src.prepare('insert into inv(total_pt) values (?)');
src.transaction(() => { for (let i = 1; i <= 5000; i++) ins.run(i * 10); })();
const expectedSum = src.prepare('select sum(total_pt) s from inv').get().s;

// VACUUM INTO header check (is the intermediate copy plaintext?)
const probe = join(dir, 'probe.db');
src.exec(`VACUUM INTO '${probe.split('\\').join('/')}'`);
r.vacuumIntoCopyHeaderPlain = readFileSync(probe).subarray(0, 15).toString('latin1') === 'SQLite format 3';
rmSync(probe);

const bk = join(dir, 'b.hbk');
const t = performance.now();
makeBackup(src, key, 'correct horse battery staple', bk, dir);
r.backupMs = Math.round(performance.now() - t);
r.backupBytes = readFileSync(bk).length;
src.close();

// restore on "replacement PC": original DB key discarded, only passphrase + backup file
const restored = readBackup(bk, 'correct horse battery staple');
const restoredFile = join(dir, 'restored.db');
writeFileSync(restoredFile, restored.db);
let rdb = open(restoredFile, { hexKey: restored.dbKeyHex });
r.restoredIntegrity = rdb.pragma('integrity_check', { simple: true });
r.restoredSumMatches = rdb.prepare('select sum(total_pt) s from inv').get().s === expectedSum;
// re-key with a fresh device key (what a new PC would wrap with its own DPAPI)
const newKey = newKeyHex();
rdb.pragma(`rekey="x'${newKey}'"`);
rdb.close();
rdb = open(restoredFile, { hexKey: newKey });
r.rekeyedRows = rdb.prepare('select count(*) c from inv').get().c;

// migration on the restored encrypted DB
const migrations = [
  { v: 1, sql: 'alter table inv add column note text' },
  { v: 2, sql: 'create table audit (id integer primary key, at text not null) strict' },
  { v: 3, sql: 'create table broken (id integer primary key); select * from missing_table' },
];
const checksum = (m) => createHash('sha256').update(m.sql).digest('hex');
rdb.exec('create table schema_migrations (version integer primary key, checksum text not null) strict');
function migrate(db, list) {
  for (const m of list) {
    const row = db.prepare('select checksum from schema_migrations where version=?').get(m.v);
    if (row) { if (row.checksum !== checksum(m)) throw new Error(`checksum mismatch v${m.v}`); continue; }
    db.transaction(() => { db.exec(m.sql); db.prepare('insert into schema_migrations values (?,?)').run(m.v, checksum(m)); })();
  }
}
migrate(rdb, migrations.slice(0, 2));
migrate(rdb, migrations.slice(0, 2));
r.migrationIdempotent = rdb.prepare('select count(*) c from schema_migrations').get().c === 2;
try { migrate(rdb, [{ v: 1, sql: 'alter table inv add column note2 text' }]); r.migrationTamperDetected = false; } catch { r.migrationTamperDetected = true; }
try { migrate(rdb, migrations); r.failingMigrationThrew = false; } catch { r.failingMigrationThrew = true; }
r.failedMigrationRolledBack = !rdb.prepare("select name from sqlite_master where name='broken'").get() && rdb.prepare('select count(*) c from schema_migrations').get().c === 2;
rdb.close();

// tamper / wrong passphrase
const attempt = (fn) => { try { fn(); return 'ACCEPTED (BAD)'; } catch (e) { return 'rejected: ' + e.message.slice(0, 60); } };
r.wrongPassphrase = attempt(() => readBackup(bk, 'wrong'));
const original = readFileSync(bk);
const flips = { header: 5, nonce: 25, body: 1000, tag: original.length - 3 };
for (const [name, pos] of Object.entries(flips)) {
  const m = Buffer.from(original); m[pos] ^= 0x01;
  const f = join(dir, `tamper-${name}.hbk`); writeFileSync(f, m);
  r[`tamper_${name}`] = attempt(() => readBackup(f, 'correct horse battery staple'));
}
const trunc = join(dir, 'trunc.hbk'); writeFileSync(trunc, original.subarray(0, original.length - 100));
r.truncated = attempt(() => readBackup(trunc, 'correct horse battery staple'));
r.backupFileContainsPlainHeader = original.includes(Buffer.from('SQLite format 3'));

console.log(JSON.stringify({ runtime: process.versions.electron ? 'electron-as-node ' + process.versions.electron : 'node ' + process.versions.node, ...r }, null, 1));
rmSync(dir, { recursive: true, force: true });
