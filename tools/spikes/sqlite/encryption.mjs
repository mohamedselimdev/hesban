import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newKeyHex, open } from './lib.mjs';

const dir = mkdtempSync(join(tmpdir(), 'hesban-enc-'));
const file = join(dir, 'enc.db');
const key = newKeyHex();
const MARK = 'HESBAN_PLAINTEXT_MARKER_9f3a';
const r = {};

let db = open(file, { hexKey: key });
r.sqliteVersion = db.prepare('select sqlite_version() v').get().v;
r.cipherPragma = db.pragma('cipher');
r.journalMode = db.pragma('journal_mode', { simple: true });
r.synchronous = db.pragma('synchronous', { simple: true });
r.foreignKeys = db.pragma('foreign_keys', { simple: true });
r.trustedSchema = db.pragma('trusted_schema', { simple: true });
db.exec(`create table t (id integer primary key, note text not null) strict;`);
db.prepare('insert into t(note) values (?)').run(MARK);
// leave WAL un-checkpointed, then inspect all files
const filesBefore = readdirSync(dir);
const bytes = filesBefore.map((f) => readFileSync(join(dir, f)));
r.files = filesBefore;
r.markerInAnyFileWhileOpen = bytes.some((b) => b.includes(Buffer.from(MARK)));
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
const main = readFileSync(file);
r.headerIsPlainSqlite = main.subarray(0, 15).toString('latin1') === 'SQLite format 3';
r.markerInMainAfterCheckpoint = main.includes(Buffer.from(MARK));

// correct key reopens
db = open(file, { hexKey: key });
r.reopenRows = db.prepare('select count(*) c from t').get().c;
db.close();

// wrong key / no key
const attempt = (fn) => { try { fn(); return 'OPENED (BAD)'; } catch (e) { return String(e.message); } };
r.wrongKey = attempt(() => open(file, { hexKey: newKeyHex() }));
r.noKey = attempt(() => open(file, {}));
r.plainDriverNoKey = attempt(() => open(file, { plain: true }));

// key rotation
db = open(file, { hexKey: key });
const key2 = newKeyHex();
db.pragma(`rekey="x'${key2}'"`);
db.close();
r.oldKeyAfterRekey = attempt(() => open(file, { hexKey: key }));
db = open(file, { hexKey: key2 });
r.newKeyRows = db.prepare('select count(*) c from t').get().c;
db.close();

// extension loading is not reachable unless code calls loadExtension
r.loadExtensionMethodPresent = typeof db.loadExtension;
db.close();

console.log(JSON.stringify({ runtime: process.versions.electron ? 'electron-as-node ' + process.versions.electron : 'node ' + process.versions.node, ...r }, null, 1));
rmSync(dir, { recursive: true, force: true });
