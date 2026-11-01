import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import electronPath from 'electron';
import { buildProbeVariant, root, run } from './helpers';

let report: Record<string, unknown> = {};
let tmp = '';

beforeAll(async () => {
  await buildProbeVariant('out-probe');
  expect(existsSync(join(root, 'out-probe/main/index.js'))).toBe(true);
  tmp = mkdtempSync(join(tmpdir(), 'hesban-selftest-'));
  const out = join(tmp, 'report.json');
  await run(
    String(electronPath),
    [join(root, 'out-probe/main/index.js'), `--user-data-dir=${join(tmp, 'data')}`],
    { HESBAN_SELFTEST: '1', HESBAN_SELFTEST_OUT: out, ELECTRON_RENDERER_URL: '' },
    60_000,
  );
  report = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
}, 240_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('real Electron renderer (built app)', () => {
  it('completed the probe without a fatal error', () => {
    expect(report['fatal']).toBeUndefined();
  });

  it('has no Node globals in the page', () => {
    expect(report['typeofRequire']).toBe('undefined');
    expect(report['typeofProcess']).toBe('undefined');
    expect(report['typeofModule']).toBe('undefined');
    expect(report['typeofIpcRenderer']).toBe('undefined');
  });

  it('exposes only the frozen window.hesban.system.ping bridge', () => {
    expect(report['apiKeys']).toEqual(['system']);
    expect(report['systemKeys']).toEqual(['ping']);
    expect(report['apiFrozen']).toBe(true);
  });

  it('completes a real IPC round trip through validation', () => {
    const ping = report['ping'] as { ok: boolean; data?: { pong: boolean; nonce: string } };
    expect(ping.ok).toBe(true);
    expect(ping.data?.nonce).toBe('probe-1');
  });

  it('CSP blocks eval and inline scripts', () => {
    expect(report['evalBlocked']).toBe(true);
    expect(report['inlineScriptRan']).toBe(false);
  });

  it('blocks new windows and navigation away', () => {
    expect(report['windowOpenResult']).toBe('null');
    expect(report['navigatedAway']).toBe(false);
    expect(report['windowCount']).toBe(report['windowCountBefore']);
  });

  it('denies permissions', () => {
    expect(String(report['geolocation'])).toMatch(/^denied|unavailable/);
    expect(['denied', 'unavailable']).toContain(report['notification']);
  });
});
