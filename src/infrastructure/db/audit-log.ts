import { createHash } from 'node:crypto';
import type { Db } from './open';

export const GENESIS_HASH = 'GENESIS';

export interface AuditEntry {
  readonly actorId: number | null;
  readonly action: string;
  readonly entityType?: string;
  readonly entityId?: string;
  /** Plain JSON-compatible data. Never put passwords, PINs, keys or full personal records here. */
  readonly details?: Readonly<Record<string, unknown>>;
}

interface AuditRow {
  id: number;
  at: string;
  actor_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details_json: string;
  prev_hash: string;
  hash: string;
}

/** JSON with sorted keys so the same data always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as object).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

function hashRow(prevHash: string, row: Omit<AuditRow, 'id' | 'prev_hash' | 'hash'>): string {
  const body = canonicalJson({
    at: row.at,
    actor_id: row.actor_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details_json: row.details_json,
  });
  return createHash('sha256').update(`${prevHash}\n${body}`, 'utf8').digest('hex');
}

/**
 * Appends one entry to the hash chain. Call it inside the same transaction as the action it
 * records, so an action and its audit row commit or roll back together.
 */
export function appendAudit(
  db: Db,
  entry: AuditEntry,
  now: () => Date = () => new Date(),
): { id: number; hash: string } {
  const last = db.prepare('select hash from audit_log order by id desc limit 1').get() as
    { hash: string } | undefined;
  const prevHash = last?.hash ?? GENESIS_HASH;
  const row = {
    at: now().toISOString(),
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    details_json: canonicalJson(entry.details ?? {}),
  };
  const hash = hashRow(prevHash, row);
  const result = db
    .prepare(
      `insert into audit_log(at, actor_id, action, entity_type, entity_id, details_json, prev_hash, hash)
       values (@at, @actor_id, @action, @entity_type, @entity_id, @details_json, @prev_hash, @hash)`,
    )
    .run({ ...row, prev_hash: prevHash, hash });
  return { id: Number(result.lastInsertRowid), hash };
}

export type ChainVerdict =
  | { readonly ok: true; readonly rows: number; readonly head: string }
  | { readonly ok: false; readonly brokenAtId: number; readonly reason: string };

/** Recomputes the whole chain. Detects edited, removed, inserted or reordered rows. */
export function verifyAuditChain(db: Db): ChainVerdict {
  const rows = db.prepare('select * from audit_log order by id').all() as AuditRow[];
  let prev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prev_hash !== prev) {
      return { ok: false, brokenAtId: row.id, reason: 'prev_hash does not match previous row' };
    }
    const expected = hashRow(prev, row);
    if (row.hash !== expected) {
      return { ok: false, brokenAtId: row.id, reason: 'row content does not match its hash' };
    }
    prev = row.hash;
  }
  return { ok: true, rows: rows.length, head: prev };
}
