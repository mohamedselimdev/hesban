import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newKeyHex, open } from './lib.mjs';

const N = Number(process.env.ITER ?? 500);
const dir = mkdtempSync(join(tmpdir(), 'hesban-crash-'));
const file = join(dir, 'c.db');
const key = newKeyHex();
let failures = [], prevDocs = 0, progressed = 0;

function runChild(delay) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['crash-child.mjs'], { env: { ...process.env, DB: file, KEY: key, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.once('data', () => setTimeout(() => child.kill(), delay));
    child.on('exit', resolve);
  });
}

for (let i = 0; i < N; i++) {
  await runChild(5 + Math.floor(Math.random() * 120));
  const db = open(file, { hexKey: key });
  try {
    const ic = db.pragma('integrity_check', { simple: true });
    const bad = db.prepare(`select count(*) c from docs d where (select count(*) from doc_lines l where l.doc_id=d.id) <> 5 or (select sum(line_pt) from doc_lines l where l.doc_id=d.id) <> d.total_pt`).get().c;
    const unbal = db.prepare(`select count(*) c from (select entry_id from journal_lines group by entry_id having sum(debit_pt) <> sum(credit_pt))`).get().c;
    const orphan = db.prepare(`select count(*) c from doc_lines where doc_id not in (select id from docs)`).get().c;
    const docs = db.prepare('select count(*) c from docs').get().c;
    if (docs > prevDocs) progressed++;
    prevDocs = docs;
    if (ic !== 'ok' || bad || unbal || orphan) failures.push({ i, ic, bad, unbal, orphan });
  } finally { db.close(); }
}
console.log(JSON.stringify({ iterations: N, killsThatHadNewCommittedDocs: progressed, finalDocs: prevDocs, integrityFailures: failures.length, failures: failures.slice(0, 3) }, null, 1));
rmSync(dir, { recursive: true, force: true });
