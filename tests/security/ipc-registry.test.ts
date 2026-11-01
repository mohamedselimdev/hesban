import { describe, expect, it } from 'vitest';
import { channelNames } from '../../src/shared/contracts/ipc';
import { registerHandlers } from '../../src/main/ipc/handlers';
import { createIpcRegistry, defineHandler, type Actor } from '../../src/main/ipc/registry';

const TRUSTED = 'file:///app/index.html';

function build(actor: Actor | null = null) {
  const logs: unknown[] = [];
  const registry = createIpcRegistry({
    isTrustedSender: (url) => url === TRUSTED,
    getActor: () => actor,
    log: (entry) => logs.push(entry),
  });
  registerHandlers(registry, '0.0.0-test');
  return { registry, logs };
}

describe('ipc registry', () => {
  it('registers only what it was given and refuses to start while contract channels lack a handler', () => {
    const { registry } = build();
    expect(registry.channels()).toEqual(['system:ping']);
    expect(() => registry.assertComplete()).toThrow(/without handler/);
    expect(channelNames).toContain('system:ping');
  });

  it('refuses a duplicate registration', () => {
    const { registry } = build();
    expect(() =>
      registry.register(
        defineHandler({
          channel: 'system:ping',
          permission: null,
          handler: ({ nonce }) => ({ pong: true as const, nonce, appVersion: 'x' }),
        }),
      ),
    ).toThrow('registered twice');
  });

  it('answers a valid ping from the trusted sender', async () => {
    const { registry } = build();
    const result = await registry.invoke('system:ping', { senderUrl: TRUSTED }, { nonce: 'n1' });
    expect(result).toEqual({
      ok: true,
      data: { pong: true, nonce: 'n1', appVersion: '0.0.0-test' },
    });
  });

  it('rejects untrusted, missing or look-alike senders before touching the payload', async () => {
    const { registry, logs } = build();
    const senders = [
      undefined,
      '',
      'https://example.com/',
      'file:///other/index.html',
      'file:///app/index.html.evil',
      'null',
    ];
    for (const senderUrl of senders) {
      const result = await registry.invoke('system:ping', { senderUrl }, { nonce: 'n' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_SENDER');
    }
    expect(logs).toHaveLength(senders.length);
  });

  it('rejects unknown channels', async () => {
    const { registry } = build();
    for (const channel of ['', 'fs:read', 'system:ping ', '__proto__', 'constructor', 'toString']) {
      const result = await registry.invoke(channel, { senderUrl: TRUSTED }, {});
      expect(result.ok, channel).toBe(false);
    }
  });

  it('rejects malformed payloads with INVALID_INPUT and no schema details', async () => {
    const { registry } = build();
    const bad: unknown[] = [
      undefined,
      null,
      'x',
      42,
      [],
      {},
      { nonce: '' },
      { nonce: 5 },
      { nonce: 'a'.repeat(65) },
      { nonce: 'ok', extra: 1 },
      JSON.parse('{"nonce":"ok","__proto__":{"admin":true}}'),
      { nonce: { toString: 'x' } },
    ];
    for (const payload of bad) {
      const result = await registry.invoke('system:ping', { senderUrl: TRUSTED }, payload);
      expect(result.ok, JSON.stringify(payload)).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_INPUT');
        expect(Object.keys(result.error).sort()).toEqual(['code', 'correlationId']);
      }
    }
  });

  it('enforces permissions: unauthenticated, forbidden, allowed', async () => {
    const guarded = (actor: Actor | null) => {
      const registry = createIpcRegistry({
        isTrustedSender: (url) => url === TRUSTED,
        getActor: () => actor,
        log: () => {},
      });
      registry.register(
        defineHandler({
          channel: 'system:ping',
          permission: 'system.admin',
          handler: ({ nonce }) => ({ pong: true as const, nonce, appVersion: 'x' }),
        }),
      );
      return registry;
    };
    const call = (actor: Actor | null) =>
      guarded(actor).invoke('system:ping', { senderUrl: TRUSTED }, { nonce: 'n' });

    const anon = await call(null);
    expect(!anon.ok && anon.error.code).toBe('UNAUTHENTICATED');

    const cashier = await call({ userId: 2, permissions: new Set(['sales.create']) });
    expect(!cashier.ok && cashier.error.code).toBe('FORBIDDEN');

    const owner = await call({ userId: 1, permissions: new Set(['system.admin']) });
    expect(owner.ok).toBe(true);
  });

  it('turns handler exceptions into INTERNAL without leaking the message', async () => {
    const registry = createIpcRegistry({
      isTrustedSender: () => true,
      getActor: () => null,
      log: () => {},
    });
    registry.register(
      defineHandler({
        channel: 'system:ping',
        permission: null,
        handler: () => {
          throw new Error('SELECT * FROM users secret-path C:\\db');
        },
      }),
    );
    const result = await registry.invoke('system:ping', { senderUrl: 'x' }, { nonce: 'n' });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('SELECT');
    expect(JSON.stringify(result)).not.toContain('secret-path');
  });

  it('refuses handler output that violates the response schema', async () => {
    const registry = createIpcRegistry({
      isTrustedSender: () => true,
      getActor: () => null,
      log: () => {},
    });
    registry.register(
      defineHandler({
        channel: 'system:ping',
        permission: null,
        handler: ({ nonce }) =>
          ({ pong: true, nonce, appVersion: 'x', leakedSecret: 'k' }) as never,
      }),
    );
    const result = await registry.invoke('system:ping', { senderUrl: 'x' }, { nonce: 'n' });
    expect(result.ok).toBe(false);
  });

  it('install() binds each channel once and derives sender from the event only', async () => {
    const { registry } = build();
    const bound = new Map<string, (event: { url?: string }, payload: unknown) => unknown>();
    registry.install(
      { handle: (channel, listener) => void bound.set(channel, listener) },
      (event: { url?: string }) => ({ url: event.url, id: 1 }),
    );
    expect([...bound.keys()]).toEqual(['system:ping']);
    const ok = await bound.get('system:ping')?.({ url: TRUSTED }, { nonce: 'n' });
    expect((ok as { ok: boolean }).ok).toBe(true);
    const bad = await bound.get('system:ping')?.({ url: 'https://evil.test/' }, { nonce: 'n' });
    expect((bad as { ok: boolean }).ok).toBe(false);
  });
});
