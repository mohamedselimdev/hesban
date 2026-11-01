import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';

/** Protects bytes with something tied to the Windows user (DPAPI in the app; a fake in tests). */
export interface KeyWrapper {
  wrap(plain: Buffer): Promise<Buffer>;
  unwrap(blob: Buffer): Promise<{ plain: Buffer; shouldReWrap: boolean }>;
}

export type KeyStoreErrorCode =
  'KEY_MISSING_FOR_EXISTING_DATABASE' | 'KEY_UNREADABLE' | 'KEY_INVALID';

export class KeyStoreError extends Error {
  readonly code: KeyStoreErrorCode;

  constructor(code: KeyStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KeyStoreError';
    this.code = code;
  }
}

export const KEY_FILE = 'db.key.enc';
export const DB_FILE = 'hesban.db';

function writeFileDurably(path: string, data: Buffer): void {
  const temp = `${path}.tmp`;
  const fd = openSync(temp, 'w');
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

export interface LoadedKey {
  /** 64 hex characters. Never log this. */
  readonly keyHex: string;
  readonly created: boolean;
}

/**
 * Returns the database key, creating it on first run only.
 * A new key is never generated while a database file already exists: that would orphan the data.
 */
export async function loadOrCreateDbKey(dir: string, wrapper: KeyWrapper): Promise<LoadedKey> {
  mkdirSync(dir, { recursive: true });
  const keyPath = join(dir, KEY_FILE);
  const dbExists = existsSync(join(dir, DB_FILE));

  if (!existsSync(keyPath)) {
    if (dbExists) {
      throw new KeyStoreError(
        'KEY_MISSING_FOR_EXISTING_DATABASE',
        'a database exists but its key file is missing; restore from an encrypted backup',
      );
    }
    const plain = randomBytes(32);
    const blob = await wrapper.wrap(plain);
    writeFileDurably(keyPath, blob);
    return { keyHex: plain.toString('hex'), created: true };
  }

  let unwrapped: { plain: Buffer; shouldReWrap: boolean };
  try {
    unwrapped = await wrapper.unwrap(readFileSync(keyPath));
  } catch (cause) {
    throw new KeyStoreError(
      'KEY_UNREADABLE',
      'the database key could not be unwrapped (different Windows user or PC, or damaged file); restore from an encrypted backup',
      { cause },
    );
  }
  if (unwrapped.plain.length !== 32) {
    throw new KeyStoreError('KEY_INVALID', 'the unwrapped database key has the wrong length');
  }
  if (unwrapped.shouldReWrap) {
    writeFileDurably(keyPath, await wrapper.wrap(unwrapped.plain));
  }
  return { keyHex: unwrapped.plain.toString('hex'), created: false };
}
