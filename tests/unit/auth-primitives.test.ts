import { describe, expect, it } from 'vitest';
import {
  BASE_LOCK_SECONDS,
  MAX_LOCK_SECONDS,
  lockSecondsAfter,
  lockedUntil,
  secondsRemaining,
} from '../../src/application/auth/lockout';
import { checkPassword, checkPin } from '../../src/application/auth/password-policy';
import { createSessionStore } from '../../src/application/auth/session-store';
import {
  PASSWORD_PARAMS,
  PIN_PARAMS,
  hashSecret,
  needsRehash,
  verifySecret,
} from '../../src/infrastructure/security/password-hasher';

describe('password policy', () => {
  it('accepts a long passphrase in any language', () => {
    expect(checkPassword('الباب الأخضر على الشارع', 'ahmed')).toEqual([]);
    expect(checkPassword('correct horse battery', 'ahmed')).toEqual([]);
  });

  it('rejects short, common, username-containing, repeated and control-character passwords', () => {
    expect(checkPassword('short', 'x')).toContain('TOO_SHORT');
    expect(checkPassword('password1', 'x')).toEqual(
      expect.arrayContaining(['TOO_SHORT', 'TOO_COMMON']),
    );
    expect(checkPassword('1234567890', 'x')).toContain('TOO_COMMON');
    expect(checkPassword('mohamed-2026-shop', 'Mohamed')).toContain('CONTAINS_USERNAME');
    expect(checkPassword('aaaaaaaaaaaa', 'x')).toContain('SINGLE_CHARACTER_REPEATED');
    expect(checkPassword('good password\u0007here', 'x')).toContain('INVALID_CHARACTERS');
    expect(checkPassword('x'.repeat(129), 'x')).toContain('TOO_LONG');
    expect(checkPassword('', 'x')).toContain('TOO_SHORT');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(checkPassword('😀'.repeat(9), 'x')).toEqual(expect.arrayContaining(['TOO_SHORT']));
    expect(checkPassword('كلمةسرمعقدة12', 'x')).toEqual([]);
  });
});

describe('PIN policy', () => {
  it('accepts 4–8 digits and converts Arabic-Indic and Persian digits', () => {
    expect(checkPin('4821')).toEqual({ ok: true, pin: '4821' });
    expect(checkPin('٤٨٢١')).toEqual({ ok: true, pin: '4821' });
    expect(checkPin('۴۸۲۱۵۹')).toEqual({ ok: true, pin: '482159' });
  });

  it('rejects wrong lengths, non-digits and trivial PINs', () => {
    const bad = (pin: string) => {
      const r = checkPin(pin);
      return r.ok ? [] : r.problems;
    };
    expect(bad('123')).toContain('TOO_SHORT');
    expect(bad('123456789')).toContain('TOO_LONG');
    expect(bad('12a4')).toContain('PIN_NOT_DIGITS');
    expect(bad('1111')).toContain('PIN_TOO_SIMPLE');
    expect(bad('1234')).toContain('PIN_TOO_SIMPLE');
    expect(bad('9876')).toContain('PIN_TOO_SIMPLE');
    expect(bad('')).toContain('TOO_SHORT');
  });
});

describe('lockout schedule', () => {
  it('allows five free attempts, then 30 s doubling up to 15 minutes', () => {
    expect([0, 1, 2, 3, 4].map(lockSecondsAfter)).toEqual([0, 0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9].map(lockSecondsAfter)).toEqual([30, 60, 120, 240, 480]);
    expect(lockSecondsAfter(10)).toBe(MAX_LOCK_SECONDS);
    expect(lockSecondsAfter(1000)).toBe(MAX_LOCK_SECONDS);
    expect(lockSecondsAfter(5)).toBe(BASE_LOCK_SECONDS);
  });

  it('rejects invalid input and computes remaining seconds', () => {
    expect(() => lockSecondsAfter(-1)).toThrow(RangeError);
    expect(() => lockSecondsAfter(1.5)).toThrow(RangeError);
    const now = new Date('2026-11-01T10:00:00.000Z');
    expect(lockedUntil(2, now)).toBeNull();
    const until = lockedUntil(5, now);
    expect(until?.toISOString()).toBe('2026-11-01T10:00:30.000Z');
    expect(secondsRemaining(until?.toISOString() ?? null, now)).toBe(30);
    expect(secondsRemaining(until?.toISOString() ?? null, new Date(now.getTime() + 29_100))).toBe(
      1,
    );
    expect(secondsRemaining(until?.toISOString() ?? null, new Date(now.getTime() + 31_000))).toBe(
      0,
    );
    expect(secondsRemaining(null, now)).toBe(0);
  });
});

describe('session store', () => {
  function clock() {
    let t = 1_000_000;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }

  it('starts, returns and ends a session per window', () => {
    const c = clock();
    const store = createSessionStore({ now: c.now });
    expect(store.touch(1)).toBeNull();
    store.start(1, 42, 'cashier');
    expect(store.touch(1)).toMatchObject({ userId: 42, role: 'cashier' });
    expect(store.touch(2)).toBeNull();
    store.end(1);
    expect(store.touch(1)).toBeNull();
  });

  it('expires after inactivity, extended by activity, and after the hard limit', () => {
    const c = clock();
    const store = createSessionStore({ now: c.now, idleMs: 1000, maxMs: 5000 });
    store.start(1, 1, 'owner');
    c.advance(900);
    expect(store.touch(1)).not.toBeNull();
    c.advance(900);
    expect(store.touch(1)).not.toBeNull();
    c.advance(1001);
    expect(store.touch(1)).toBeNull();

    store.start(2, 2, 'owner');
    for (let i = 0; i < 5; i++) {
      c.advance(900);
      expect(store.touch(2), `step ${i}`).not.toBeNull();
    }
    c.advance(900);
    expect(store.touch(2)).toBeNull(); // 5 x 900 + 900 = 5400 > 5000 hard limit
  });

  it('replaces an older session and revokes all sessions of a user', () => {
    const store = createSessionStore({ now: () => 1 });
    store.start(1, 7, 'cashier');
    store.start(1, 8, 'manager');
    expect(store.touch(1)).toMatchObject({ userId: 8, role: 'manager' });
    store.start(2, 8, 'manager');
    store.start(3, 9, 'cashier');
    expect(store.revokeUser(8)).toBe(2);
    expect(store.size()).toBe(1);
    expect(store.touch(3)).not.toBeNull();
  });
});

describe('password hasher (real parameters)', () => {
  it('hashes and verifies with salted scrypt, rejects wrong secrets', async () => {
    const hash = await hashSecret('كلمة سر قوية 123', PASSWORD_PARAMS);
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifySecret('كلمة سر قوية 123', hash)).toBe(true);
    expect(await verifySecret('كلمة سر قوية 124', hash)).toBe(false);
    expect(await verifySecret('', hash)).toBe(false);
    const other = await hashSecret('كلمة سر قوية 123', PIN_PARAMS);
    expect(other).not.toBe(hash);
    expect(await verifySecret('كلمة سر قوية 123', other)).toBe(true);
  }, 30_000);

  it('treats equivalent Unicode forms as the same password (NFKC)', async () => {
    const hash = await hashSecret('ｐａｓｓｗｏｒｄ-wide', PIN_PARAMS);
    expect(await verifySecret('password-wide', hash)).toBe(true);
  });

  it('fails closed on malformed or dangerous stored values', async () => {
    const good = await hashSecret('x-secret-value', PIN_PARAMS);
    const parts = good.split('$');
    const variants = [
      '',
      'plain',
      'scrypt$1$2',
      good.replace('scrypt', 'argon2'),
      [parts[0], '1000000000', parts[2], parts[3], parts[4], parts[5]].join('$'),
      [parts[0], '16384', '999', parts[3], parts[4], parts[5]].join('$'),
      [parts[0], '16383', parts[2], parts[3], parts[4], parts[5]].join('$'),
      [parts[0], parts[1], parts[2], parts[3], 'AA==', parts[5]].join('$'),
      [parts[0], parts[1], parts[2], parts[3], parts[4], 'AAAA'].join('$'),
    ];
    for (const v of variants) expect(await verifySecret('x-secret-value', v), v).toBe(false);
  });

  it('flags weaker stored parameters for rehash', async () => {
    const weak = await hashSecret('another-secret-1', { N: 2 ** 12, r: 8, p: 1 });
    expect(needsRehash(weak, PASSWORD_PARAMS)).toBe(true);
    expect(needsRehash(weak, { N: 2 ** 12, r: 8, p: 1 })).toBe(false);
    expect(needsRehash('garbage', PASSWORD_PARAMS)).toBe(true);
  });
});
