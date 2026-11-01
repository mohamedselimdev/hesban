import { channelNames } from '../../src/shared/contracts/ipc';
import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../src/main/csp';
import {
  denyAllPermissions,
  hardenWebContents,
  isTrustedUrl,
  secureWebPreferences,
  type SessionLike,
  type WebContentsLike,
} from '../../src/main/security';
import { createApi } from '../../src/preload/api';

const trusted = { rendererIndexPath: 'C:\\App\\out\\renderer\\index.html' };
const trustedDev = { ...trusted, devServerOrigin: 'http://localhost:5173' };

describe('secureWebPreferences', () => {
  const prefs = secureWebPreferences('C:\\App\\preload.cjs', true);

  it('pins isolation settings', () => {
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.nodeIntegrationInWorker).toBe(false);
    expect(prefs.nodeIntegrationInSubFrames).toBe(false);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.allowRunningInsecureContent).toBe(false);
    expect(prefs.webviewTag).toBe(false);
    expect(prefs.experimentalFeatures).toBe(false);
  });

  it('disables devtools when packaged and allows them in development', () => {
    expect(secureWebPreferences('p', true).devTools).toBe(false);
    expect(secureWebPreferences('p', false).devTools).toBe(true);
  });
});

describe('isTrustedUrl', () => {
  it('accepts only the exact built index.html', () => {
    expect(isTrustedUrl('file:///C:/App/out/renderer/index.html', trusted)).toBe(true);
    expect(isTrustedUrl('file:///c:/app/out/renderer/index.html', trusted)).toBe(true);
  });

  it('rejects other files, queries to other pages, and non-file schemes', () => {
    const bad = [
      undefined,
      '',
      'not a url',
      'file:///C:/App/out/renderer/other.html',
      'file:///C:/App/out/renderer/index.html?x=1',
      'file:///C:/Windows/System32/drivers/etc/hosts',
      'https://example.com/',
      'http://localhost:5173/',
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'about:blank',
      'chrome://gpu',
      'ftp://x/',
    ];
    for (const url of bad) expect(isTrustedUrl(url, trusted), String(url)).toBe(false);
  });

  it('accepts the dev server origin only when configured', () => {
    expect(isTrustedUrl('http://localhost:5173/', trustedDev)).toBe(true);
    expect(isTrustedUrl('http://localhost:5173/src/x', trustedDev)).toBe(true);
    expect(isTrustedUrl('http://localhost:5174/', trustedDev)).toBe(false);
    expect(isTrustedUrl('http://localhost.evil.test:5173/', trustedDev)).toBe(false);
    expect(isTrustedUrl('https://localhost:5173/', trustedDev)).toBe(false);
  });
});

function fakeContents() {
  const listeners = new Map<
    string,
    (event: { preventDefault(): void }, ...args: never[]) => void
  >();
  let openHandler: (() => { action: 'deny' }) | undefined;
  const contents: WebContentsLike = {
    setWindowOpenHandler: (h) => {
      openHandler = h;
    },
    on: (event, listener) => void listeners.set(event, listener),
  };
  return { contents, listeners, open: () => openHandler?.() };
}

describe('hardenWebContents', () => {
  it('denies every window.open', () => {
    const { contents, open } = fakeContents();
    hardenWebContents(contents, trusted);
    expect(open()).toEqual({ action: 'deny' });
  });

  it('blocks navigation to untrusted URLs and allows the app page', () => {
    const { contents, listeners } = fakeContents();
    const blocked: string[] = [];
    hardenWebContents(contents, trusted, (_kind, url) => blocked.push(url));

    for (const eventName of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
      const handler = listeners.get(eventName);
      expect(handler, eventName).toBeDefined();

      let prevented = false;
      handler?.({ preventDefault: () => (prevented = true) }, 'https://example.com/' as never);
      expect(prevented, `${eventName} external`).toBe(true);

      prevented = false;
      handler?.(
        { preventDefault: () => (prevented = true) },
        'file:///C:/App/out/renderer/index.html' as never,
      );
      expect(prevented, `${eventName} app page`).toBe(false);
    }
    expect(blocked).toHaveLength(3);
  });

  it('blocks webview attachment', () => {
    const { contents, listeners } = fakeContents();
    hardenWebContents(contents, trusted);
    let prevented = false;
    listeners.get('will-attach-webview')?.({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
  });
});

describe('denyAllPermissions', () => {
  it('denies requests, checks and device grants', () => {
    let request: ((wc: unknown, p: string, cb: (g: boolean) => void) => void) | undefined;
    let check: (() => boolean) | undefined;
    let device: (() => boolean) | undefined;
    const session: SessionLike = {
      setPermissionRequestHandler: (h) => void (request = h),
      setPermissionCheckHandler: (h) => void (check = h),
      setDevicePermissionHandler: (h) => void (device = h),
    };
    denyAllPermissions(session);

    for (const permission of ['geolocation', 'notifications', 'media', 'clipboard-read', 'usb']) {
      let granted: boolean | undefined;
      request?.(null, permission, (g) => (granted = g));
      expect(granted, permission).toBe(false);
    }
    expect(check?.()).toBe(false);
    expect(device?.()).toBe(false);
  });
});

describe('content security policy', () => {
  it('production policy has no unsafe sources and no external origins', () => {
    const csp = buildCsp('production');
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*|https?:|ws:/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it('development policy relaxes only what the dev server needs', () => {
    const csp = buildCsp('development', 'http://localhost:5173');
    expect(csp).toContain('ws://localhost:5173');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("default-src 'none'");
  });
});

describe('preload API surface', () => {
  const surface = {
    system: ['ping'],
    auth: ['status', 'setup', 'login', 'loginPin', 'logout', 'changePassword'],
    users: ['list', 'create', 'resetPassword', 'setRole', 'deactivate'],
    audit: ['verify'],
  };

  it('exposes exactly the declared groups and methods, all frozen, and no raw IPC primitives', () => {
    const api = createApi(async () => ({ ok: true }));
    expect(Object.keys(api).sort()).toEqual(Object.keys(surface).sort());
    expect(Object.isFrozen(api)).toBe(true);
    for (const [group, methods] of Object.entries(surface)) {
      const g = (api as unknown as Record<string, Record<string, unknown>>)[group] as Record<
        string,
        unknown
      >;
      expect(Object.keys(g).sort(), group).toEqual([...methods].sort());
      expect(Object.isFrozen(g), group).toBe(true);
    }
    for (const forbidden of ['ipcRenderer', 'invoke', 'send', 'on', 'require', 'process']) {
      expect(forbidden in api, forbidden).toBe(false);
    }
  });

  it('maps every method to exactly one contract channel with the payload it was given', async () => {
    const calls: Array<[string, unknown]> = [];
    const api = createApi(async (channel, payload) => {
      calls.push([channel, payload]);
      return { ok: true };
    });
    await api.system.ping('abc');
    await api.auth.status();
    await api.auth.login({ username: 'u1x', password: 'p' });
    await api.auth.logout();
    await api.users.list();
    await api.users.deactivate({ userId: 3 });
    await api.audit.verify();
    expect(calls).toEqual([
      ['system:ping', { nonce: 'abc' }],
      ['auth:status', {}],
      ['auth:login', { username: 'u1x', password: 'p' }],
      ['auth:logout', {}],
      ['users:list', {}],
      ['users:deactivate', { userId: 3 }],
      ['audit:verify', {}],
    ]);
    for (const [channel] of calls) expect(channelNames as string[]).toContain(channel);
  });
});
