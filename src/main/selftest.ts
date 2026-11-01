import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { openAppDatabase } from '../infrastructure/db/database-service';
import { DB_FILE, KEY_FILE, loadOrCreateDbKey } from '../infrastructure/db/key-store';
import { electronKeyWrapper } from './safe-storage';

/** Opens the real encrypted database with the real DPAPI key wrapper inside Electron. */
async function databaseProbe(outPath: string): Promise<Record<string, unknown>> {
  const dir = join(dirname(outPath), 'db-probe');
  mkdirSync(dir, { recursive: true });
  const first = await openAppDatabase({ dir, wrapper: electronKeyWrapper });
  const created = first.keyCreated;
  const migrated = first.migration.current;
  first.db.prepare("insert into app_meta(key, value) values ('probe', 'ok')").run();
  first.close();
  const second = await openAppDatabase({ dir, wrapper: electronKeyWrapper });
  const readBack = second.db.prepare("select value from app_meta where key = 'probe'").get();
  const reopenedApplied = second.migration.applied.length;
  second.close();
  const { keyHex } = await loadOrCreateDbKey(dir, electronKeyWrapper);
  const keyBlob = readFileSync(join(dir, KEY_FILE));
  const header = readFileSync(join(dir, DB_FILE)).subarray(0, 15).toString('latin1');
  return {
    keyCreated: created,
    migrated,
    reopenedApplied,
    readBack,
    headerIsPlainSqlite: header === 'SQLite format 3',
    keyFileHoldsPlainKey:
      keyBlob.includes(Buffer.from(keyHex)) || keyBlob.includes(Buffer.from(keyHex, 'hex')),
    keyBlobBytes: keyBlob.length,
  };
}

/**
 * Runtime security probe. Runs only when HESBAN_SELFTEST=1 and the app is not packaged.
 * Executes checks inside the real renderer and writes a JSON report to a file.
 */
const PROBE = `(async () => {
  const out = {};
  out.typeofRequire = typeof require;
  out.typeofProcess = typeof process;
  out.typeofModule = typeof module;
  out.typeofIpcRenderer = typeof ipcRenderer;
  out.apiKeys = Object.keys(window.hesban || {});
  out.systemKeys = Object.keys((window.hesban || {}).system || {});
  out.apiFrozen = Object.isFrozen(window.hesban);
  try {
    const r = await window.hesban.system.ping('probe-1');
    out.ping = r;
  } catch (e) { out.pingError = String(e); }
  try { out.evalBlocked = false; eval('1+1'); } catch (e) { out.evalBlocked = true; }
  try {
    window.__inlineRan = false;
    const s = document.createElement('script');
    s.textContent = 'window.__inlineRan = true';
    document.head.appendChild(s);
    out.inlineScriptRan = window.__inlineRan === true;
  } catch (e) { out.inlineScriptRan = false; }
  out.windowOpenResult = window.open('https://example.com') === null ? 'null' : 'window';
  out.geolocation = await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve('unavailable');
    navigator.geolocation.getCurrentPosition(() => resolve('granted'), (e) => resolve('denied:' + e.code), { timeout: 2000 });
  });
  out.notification = typeof Notification === 'undefined' ? 'unavailable' : await Notification.requestPermission();
  out.hrefBefore = location.href;
  return out;
})()`;

export async function runSelfTest(win: BrowserWindow, outPath: string): Promise<void> {
  const report: Record<string, unknown> = {};
  const contents = win.webContents;
  const windowsBefore = (await import('electron')).BrowserWindow.getAllWindows().length;
  try {
    Object.assign(report, (await contents.executeJavaScript(PROBE, true)) as object);
    const beforeUrl = contents.getURL();
    void contents.executeJavaScript(`location.href = 'https://example.com/'`, true).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    report.navigatedAway = contents.getURL() !== beforeUrl;
    report.windowCount = (await import('electron')).BrowserWindow.getAllWindows().length;
    report.windowCountBefore = windowsBefore;
  } catch (error) {
    report.fatal = error instanceof Error ? error.message : String(error);
  }
  try {
    report.database = await databaseProbe(outPath);
  } catch (error) {
    report.databaseError = error instanceof Error ? error.message : String(error);
  }
  writeFileSync(outPath, JSON.stringify(report, null, 2));
}
