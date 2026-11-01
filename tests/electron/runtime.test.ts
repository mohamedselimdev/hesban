import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import electronPath from 'electron';

const root = process.cwd();
let report: Record<string, unknown> = {};
let tmp = '';

beforeAll(async () => {
  expect(existsSync(join(root, 'out/main/index.js')), 'run electron-vite build first').toBe(true);
  tmp = mkdtempSync(join(tmpdir(), 'hesban-selftest-'));
  const out = join(tmp, 'report.json');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(String(electronPath), [root, `--user-data-dir=${join(tmp, 'data')}`], {
      env: {
        ...process.env,
        HESBAN_SELFTEST: '1',
        HESBAN_SELFTEST_OUT: out,
        ELECTRON_RENDERER_URL: '',
      },
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('electron self-test timed out'));
    }, 60_000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.on('error', reject);
  });
  report = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
}, 90_000);

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
