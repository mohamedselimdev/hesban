import { writeFileSync } from 'node:fs';
import type { BrowserWindow } from 'electron';

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
  writeFileSync(outPath, JSON.stringify(report, null, 2));
}
