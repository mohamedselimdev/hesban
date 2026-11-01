import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
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

/** Newest pre-migration safety copies kept next to the database. */
const KEEP_PRE_MIGRATION_COPIES = 3;

/**
 * Minimal safety net until the full backup module exists (Week 12): checkpoints the WAL and copies
 * the (still encrypted, same key) database file before an existing database is migrated.
 */
function preMigrationCopy(dir: string, db: Db, context: BackupContext): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
  const source = join(dir, DB_FILE);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(
    dir,
    `${DB_FILE}.pre-v${context.fromVersion}-to-v${context.toVersion}-${stamp}.bak`,
  );
  copyFileSync(source, target);
  if (!existsSync(target)) throw new Error('pre-migration copy was not created');
  const copies = readdirSync(dir)
    .filter((name) => name.startsWith(`${DB_FILE}.pre-v`) && name.endsWith('.bak'))
    .sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - KEEP_PRE_MIGRATION_COPIES))) {
    rmSync(join(dir, old));
  }
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
      beforeMigrate:
        options.beforeMigrate ?? ((context) => preMigrationCopy(options.dir, db, context)),
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
