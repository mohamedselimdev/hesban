/// <reference types="vite/client" />
import type { Migration } from './runner';

const files = import.meta.glob('./sql/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FILE_PATTERN = /^\.\/sql\/(\d{4})_([a-z0-9_]+)\.sql$/;

/** SQL files are embedded at build time, so the packaged app needs no loose files. */
export function loadMigrations(): Migration[] {
  return Object.entries(files)
    .map(([path, sql]) => {
      const match = FILE_PATTERN.exec(path);
      if (!match) throw new Error(`bad migration file name: ${path}`);
      return { version: Number(match[1]), name: match[2] as string, sql };
    })
    .sort((a, b) => a.version - b.version);
}
