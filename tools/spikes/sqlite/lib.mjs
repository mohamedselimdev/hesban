import Plain from 'better-sqlite3';
import Cipher from 'better-sqlite3-multiple-ciphers';
import { randomBytes } from 'node:crypto';

export const newKeyHex = () => randomBytes(32).toString('hex');

/** Opens a database. hexKey => SQLCipher v4 compatible mode with a raw 256-bit key. */
export function open(file, { hexKey, plain = false } = {}) {
  const db = plain ? new Plain(file) : new Cipher(file);
  try {
  if (hexKey) {
    db.pragma("cipher='sqlcipher'");
    db.pragma('legacy=4');
    db.pragma(`key="x'${hexKey}'"`);
  }
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('trusted_schema = OFF');
  db.pragma('busy_timeout = 5000');
  } catch (e) { db.close(); throw e; }
  return db;
}

export function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
