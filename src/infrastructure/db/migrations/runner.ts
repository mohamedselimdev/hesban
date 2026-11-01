import { createHash } from 'node:crypto';
import type { Db } from '../open';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export type MigrationErrorCode =
  | 'INVALID_MIGRATION_LIST'
  | 'CHECKSUM_MISMATCH'
  | 'NEWER_SCHEMA'
  | 'VERSION_MISMATCH'
  | 'BACKUP_FAILED'
  | 'MIGRATION_FAILED';

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;

  constructor(code: MigrationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MigrationError';
    this.code = code;
  }
}

export interface BackupContext {
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface MigrateOptions {
  /**
   * Called before any change when an existing database (version >= 1) has pending migrations.
   * Must throw if the backup could not be made and verified; migration is then aborted.
   * Real implementation arrives with the backup module (Week 12).
   */
  readonly beforeMigrate?: (context: BackupContext) => void;
}

export interface MigrateResult {
  readonly applied: readonly number[];
  readonly current: number;
}

/** Line endings are normalised so a checkout with CRLF produces the same checksum as LF. */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function validateList(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (!Number.isInteger(migration.version) || migration.version !== index + 1) {
      throw new MigrationError(
        'INVALID_MIGRATION_LIST',
        `migration at position ${index + 1} has version ${migration.version}; versions must be 1, 2, 3, ... without gaps`,
      );
    }
    if (migration.name.trim() === '' || migration.sql.trim() === '') {
      throw new MigrationError('INVALID_MIGRATION_LIST', `migration ${migration.version} is empty`);
    }
  });
}

const BOOTSTRAP_SQL = `
create table if not exists schema_migrations (
  version integer primary key,
  name text not null,
  checksum text not null,
  applied_at text not null
) strict`;

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
}

/**
 * Applies pending migrations forward-only. All pending migrations run in ONE immediate
 * transaction: either every one is applied or the database is unchanged.
 * Refuses to touch a database whose history does not match, or that is newer than the app.
 */
export function migrate(
  db: Db,
  migrations: readonly Migration[],
  options: MigrateOptions = {},
): MigrateResult {
  validateList(migrations);
  db.exec(BOOTSTRAP_SQL);

  const applied = db
    .prepare('select version, name, checksum from schema_migrations order by version')
    .all() as AppliedRow[];

  const known = new Map(migrations.map((m) => [m.version, m]));
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new MigrationError(
        'NEWER_SCHEMA',
        `database has migration ${row.version} (${row.name}) that this app version does not know; refusing to open`,
      );
    }
    if (row.checksum !== checksumOf(migration.sql)) {
      throw new MigrationError(
        'CHECKSUM_MISMATCH',
        `migration ${row.version} (${row.name}) was changed after it was applied`,
      );
    }
  }

  const currentVersion =
    applied.length === 0 ? 0 : (applied[applied.length - 1] as AppliedRow).version;
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  if (userVersion !== currentVersion) {
    throw new MigrationError(
      'VERSION_MISMATCH',
      `user_version ${userVersion} does not match migration history ${currentVersion}`,
    );
  }

  const pending = migrations.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return { applied: [], current: currentVersion };

  const targetVersion = (pending[pending.length - 1] as Migration).version;
  if (currentVersion >= 1 && options.beforeMigrate) {
    try {
      options.beforeMigrate({ fromVersion: currentVersion, toVersion: targetVersion });
    } catch (cause) {
      throw new MigrationError(
        'BACKUP_FAILED',
        'pre-migration backup failed; nothing was changed',
        {
          cause,
        },
      );
    }
  }

  const record = db.prepare(
    'insert into schema_migrations(version, name, checksum, applied_at) values (?, ?, ?, ?)',
  );
  const run = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      record.run(
        migration.version,
        migration.name,
        checksumOf(migration.sql),
        new Date().toISOString(),
      );
    }
    db.pragma(`user_version = ${targetVersion}`);
  });

  try {
    run.immediate();
  } catch (cause) {
    throw new MigrationError('MIGRATION_FAILED', 'migration failed; database left unchanged', {
      cause,
    });
  }
  return { applied: pending.map((m) => m.version), current: targetVersion };
}
