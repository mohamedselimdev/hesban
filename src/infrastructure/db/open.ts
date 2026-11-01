import Database from 'better-sqlite3-multiple-ciphers';

export type Db = Database.Database;

export interface OpenOptions {
  readonly file: string;
  /** Raw 256-bit database key as 64 hex characters. Omit only for unencrypted test databases. */
  readonly keyHex?: string;
  readonly readonly?: boolean;
}

const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Opens a database with the HESBAN pragmas. With a key it uses SQLCipher v4 mode.
 * The handle is closed again if anything fails, so a wrong key cannot leave the file locked.
 */
export function openDatabase(options: OpenOptions): Db {
  if (options.keyHex !== undefined && !KEY_PATTERN.test(options.keyHex)) {
    // The key is placed into a PRAGMA, so only a strict hex string is accepted.
    throw new Error('database key must be 64 hex characters');
  }

  const db = options.readonly
    ? new Database(options.file, { readonly: true, fileMustExist: true })
    : new Database(options.file);
  try {
    if (options.keyHex !== undefined) {
      db.pragma("cipher='sqlcipher'");
      db.pragma('legacy=4');
      db.pragma(`key="x'${options.keyHex}'"`);
    }
    if (!options.readonly) {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
    }
    db.pragma('foreign_keys = ON');
    db.pragma('trusted_schema = OFF');
    db.pragma('busy_timeout = 5000');
    // Forces the key check now: a wrong key fails here, not on the first query later.
    db.prepare('select count(*) from sqlite_master').get();
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
