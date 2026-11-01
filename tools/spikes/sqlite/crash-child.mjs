import { open } from './lib.mjs';
const db = open(process.env.DB, { hexKey: process.env.KEY });
db.exec(`
create table if not exists docs (id integer primary key, total_pt integer not null) strict;
create table if not exists doc_lines (id integer primary key, doc_id integer not null references docs(id), line_pt integer not null) strict;
create index if not exists ix_lines_doc on doc_lines(doc_id);
create table if not exists journal_lines (id integer primary key, entry_id integer not null, debit_pt integer not null, credit_pt integer not null) strict;
create index if not exists ix_j_entry on journal_lines(entry_id);`);
const insD = db.prepare('insert into docs(total_pt) values (?)');
const insL = db.prepare('insert into doc_lines(doc_id,line_pt) values (?,?)');
const insJ = db.prepare('insert into journal_lines(entry_id,debit_pt,credit_pt) values (?,?,?)');
const post = db.transaction((seed) => {
  const lines = [0, 1, 2, 3, 4].map((i) => 100 + ((seed + i * 7) % 900));
  const total = lines.reduce((a, b) => a + b, 0);
  const d = insD.run(total).lastInsertRowid;
  for (const l of lines) insL.run(d, l);
  insJ.run(d, total, 0);
  insJ.run(d, 0, total);
});
process.stdout.write('READY\n');
for (let i = 0; ; i++) post.immediate(i);
