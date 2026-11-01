import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newKeyHex, open, percentile } from './lib.mjs';

const ROWS = Number(process.env.ROWS ?? 1_000_000);
const runtime = process.versions.electron ? `electron-as-node ${process.versions.electron}` : `node ${process.versions.node}`;

const schema = `
create table products (id integer primary key, barcode text not null unique, name text not null, price_pt integer not null) strict;
create table stock_movements (id integer primary key, product_id integer not null, qty_delta_milli integer not null, value_delta_pt integer not null, qty_after_milli integer not null, value_after_pt integer not null, source_id integer not null, at text not null) strict;
create index ix_mov_product on stock_movements(product_id, id);
create table docs (id integer primary key, total_pt integer not null) strict;
create table doc_lines (id integer primary key, doc_id integer not null references docs(id), product_id integer not null, qty_milli integer not null, line_pt integer not null) strict;
create table journal_lines (id integer primary key, entry_id integer not null, account integer not null, debit_pt integer not null, credit_pt integer not null) strict;
`;

function run(label, opts) {
  const dir = mkdtempSync(join(tmpdir(), 'hesban-bench-'));
  const db = open(join(dir, 'b.db'), opts);
  db.exec(schema);
  const res = { label };

  let t = performance.now();
  const insP = db.prepare('insert into products(barcode,name,price_pt) values (?,?,?)');
  db.transaction(() => { for (let i = 0; i < 50_000; i++) insP.run(`622${String(i).padStart(10, '0')}`, `منتج ${i}`, 1000 + (i % 5000)); })();
  res.insert50kProductsMs = Math.round(performance.now() - t);

  t = performance.now();
  const insM = db.prepare('insert into stock_movements(product_id,qty_delta_milli,value_delta_pt,qty_after_milli,value_after_pt,source_id,at) values (?,?,?,?,?,?,?)');
  const batch = 10_000;
  for (let b = 0; b < ROWS / batch; b++) {
    db.transaction(() => { for (let i = 0; i < batch; i++) insM.run((i % 50_000) + 1, 1000, 5000, 1000, 5000, b, '2026-11-01T00:00:00Z'); })();
  }
  res.insertMovementsMs = Math.round(performance.now() - t);
  res.movementRows = ROWS;

  const lat = [];
  const insD = db.prepare('insert into docs(total_pt) values (?)');
  const insL = db.prepare('insert into doc_lines(doc_id,product_id,qty_milli,line_pt) values (?,?,?,?)');
  const insJ = db.prepare('insert into journal_lines(entry_id,account,debit_pt,credit_pt) values (?,?,?,?)');
  const sel = db.prepare('select qty_after_milli, value_after_pt from stock_movements where product_id = ? order by id desc limit 1');
  const post = db.transaction(() => {
    const d = insD.run(0).lastInsertRowid;
    for (let i = 1; i <= 20; i++) {
      const pid = (i * 37) % 50_000 + 1;
      sel.get(pid);
      insL.run(d, pid, 1000, 1000);
      insM.run(pid, -1000, -500, 0, 0, d, '2026-11-01T00:00:00Z');
    }
    for (let i = 0; i < 4; i++) insJ.run(d, 1100 + i, 100, 0);
  });
  for (let i = 0; i < 500; i++) { const s = performance.now(); post.immediate(); lat.push(performance.now() - s); }
  lat.sort((a, b) => a - b);
  res.post20LineTxMs = { p50: +percentile(lat, 0.5).toFixed(2), p95: +percentile(lat, 0.95).toFixed(2), max: +lat.at(-1).toFixed(2) };

  const find = db.prepare('select id, name, price_pt from products where barcode = ?');
  const lk = [];
  for (let i = 0; i < 10_000; i++) { const s = performance.now(); find.get(`622${String((i * 7919) % 50_000).padStart(10, '0')}`); lk.push(performance.now() - s); }
  lk.sort((a, b) => a - b);
  res.barcodeLookupMs = { p50: +percentile(lk, 0.5).toFixed(3), p95: +percentile(lk, 0.95).toFixed(3) };

  db.close();
  rmSync(dir, { recursive: true, force: true });
  return res;
}

const out = [run('plain better-sqlite3', { plain: true }), run('multiple-ciphers sqlcipher-v4 raw key', { hexKey: newKeyHex() })];
const [p, e] = out;
console.log(JSON.stringify({ runtime, out, encryptedOverheadPct: {
  insertMovements: +(((e.insertMovementsMs / p.insertMovementsMs) - 1) * 100).toFixed(1),
  post20LineP95: +(((e.post20LineTxMs.p95 / p.post20LineTxMs.p95) - 1) * 100).toFixed(1),
  barcodeP95: +(((e.barcodeLookupMs.p95 / p.barcodeLookupMs.p95) - 1) * 100).toFixed(1) } }, null, 1));
