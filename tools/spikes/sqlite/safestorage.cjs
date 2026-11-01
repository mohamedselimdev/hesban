const { app, safeStorage } = require('electron');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Database = require('better-sqlite3-multiple-ciphers');

app.whenReady().then(() => {
  const r = { electron: process.versions.electron };
  const dir = mkdtempSync(join(tmpdir(), 'hesban-ss-'));
  try {
    r.available = safeStorage.isEncryptionAvailable();
    r.backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'dpapi';
    const keyHex = randomBytes(32).toString('hex');
    const blob = safeStorage.encryptString(keyHex);
    r.blobBytes = blob.length;
    r.blobContainsPlainKey = blob.includes(Buffer.from(keyHex));
    writeFileSync(join(dir, 'key.bin'), blob);
    r.roundTrip = safeStorage.decryptString(blob) === keyHex;
    const tampered = Buffer.from(blob); tampered[tampered.length - 2] ^= 1;
    try { safeStorage.decryptString(tampered); r.tamperRejected = false; } catch { r.tamperRejected = true; }
    // use unwrapped key to open encrypted DB
    const unwrapped = safeStorage.decryptString(blob);
    const db = new Database(join(dir, 'k.db'));
    db.pragma("cipher='sqlcipher'"); db.pragma('legacy=4'); db.pragma(`key="x'${unwrapped}'"`);
    db.exec('create table t(a integer) strict; insert into t values (1)');
    r.openedWithUnwrappedKey = db.prepare('select a from t').get().a === 1;
    db.close();
  } catch (e) { r.error = String(e); }
  console.log(JSON.stringify(r, null, 1));
  rmSync(dir, { recursive: true, force: true });
  app.exit(0);
});
