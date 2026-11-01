const out = {};
for (const name of ['better-sqlite3', 'better-sqlite3-multiple-ciphers']) {
  try {
    const mod = (await import(name)).default;
    const db = new mod(':memory:');
    out[name] = { ok: true, sqlite: db.prepare('select sqlite_version() v').get().v };
    if (name.includes('ciphers')) out[name].cipher = (()=>{try{return db.pragma('cipher')}catch(e){return String(e)}})();
    db.close();
  } catch (e) { out[name] = { ok: false, error: String(e).slice(0, 200) }; }
}
try {
  const m = await import('@signalapp/sqlcipher');
  out['@signalapp/sqlcipher'] = { ok: true, exports: Object.keys(m) };
} catch (e) { out['@signalapp/sqlcipher'] = { ok: false, error: String(e).slice(0, 200) }; }
console.log(JSON.stringify({ node: process.versions.node, electron: process.versions.electron ?? null, abi: process.versions.modules, out }, null, 1));
