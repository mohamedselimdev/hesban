import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export interface HashParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

/**
 * scrypt, built into Node (no native dependency). Passwords use the OWASP minimum for scrypt
 * (N = 2^17, r = 8, p = 1, about 270 ms and 128 MB here). PINs use a cheaper setting because a
 * 4 to 8 digit PIN is only protected by the lockout and by database encryption, not by hash cost.
 */
export const PASSWORD_PARAMS: HashParams = { N: 2 ** 17, r: 8, p: 1 };
export const PIN_PARAMS: HashParams = { N: 2 ** 15, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

function derive(secret: string, salt: Buffer, params: HashParams): Promise<Buffer> {
  const options: ScryptOptions = {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * 1024 * 1024,
  };
  return new Promise((resolve, reject) => {
    scrypt(secret.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Format: scrypt$N$r$p$salt(base64)$hash(base64), so parameters can be raised later. */
export async function hashSecret(secret: string, params: HashParams): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(secret, salt, params);
  return [
    PREFIX,
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

interface Parsed {
  params: HashParams;
  salt: Buffer;
  key: Buffer;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null;
  if (N > 2 ** 20 || r > 32 || p > 16 || (N & (N - 1)) !== 0) return null;
  const salt = Buffer.from(parts[4] as string, 'base64');
  const key = Buffer.from(parts[5] as string, 'base64');
  if (salt.length < 8 || key.length !== KEY_LENGTH) return null;
  return { params: { N, r, p }, salt, key };
}

/** Constant-time comparison. Malformed stored values simply fail verification. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const candidate = await derive(secret, parsed.salt, parsed.params);
  return timingSafeEqual(candidate, parsed.key);
}

/** True when the stored hash uses weaker parameters than the current setting. */
export function needsRehash(stored: string, target: HashParams): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return parsed.params.N < target.N || parsed.params.r < target.r || parsed.params.p < target.p;
}
