import { join } from 'node:path';
import { DB_FILE, loadOrCreateDbKey, type KeyWrapper } from './key-store';
import { loadMigrations } from './migrations/load';
import {
  migrate,
  type BackupContext,
  type Migration,
  type MigrateResult,
} from './migrations/runner';
import { openDatabase, type Db } from './open';

export interface AppDatabaseOptions {
  /** Folder holding the database file and the wrapped key (the app's user-data folder). */
  readonly dir: string;
  readonly wrapper: KeyWrapper;
  /** Overridable in tests. */
  readonly migrations?: readonly Migration[];
  /** Must make and verify a backup, or throw. Called only when an existing database will change. */
  readonly beforeMigrate?: (context: BackupContext) => void;
}

export interface AppDatabase {
  readonly db: Db;
  readonly keyCreated: boolean;
  readonly migration: MigrateResult;
  /** Truncates the WAL and closes the connection. */
  close(): void;
}

/**
 * Opens the encrypted application database: unwraps (or on first run creates) the key, opens in
 * SQLCipher mode, applies pending migrations. On any failure the handle is closed.
 */
export async function openAppDatabase(options: AppDatabaseOptions): Promise<AppDatabase> {
  const { keyHex, created } = await loadOrCreateDbKey(options.dir, options.wrapper);
  const db = openDatabase({ file: join(options.dir, DB_FILE), keyHex });
  try {
    const migration = migrate(db, options.migrations ?? loadMigrations(), {
      ...(options.beforeMigrate ? { beforeMigrate: options.beforeMigrate } : {}),
    });
    return {
      db,
      keyCreated: created,
      migration,
      close() {
        if (!db.open) return;
        try {
          db.pragma('wal_checkpoint(TRUNCATE)');
        } finally {
          db.close();
        }
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
