import { app, BrowserWindow, ipcMain, Menu, session } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { buildCsp } from './csp';
import { registerHandlers } from './ipc/handlers';
import { createIpcRegistry } from './ipc/registry';
import {
  denyAllPermissions,
  hardenWebContents,
  isTrustedUrl,
  secureWebPreferences,
} from './security';
import type { TrustedOrigins } from './security';

const rendererIndexPath = join(import.meta.dirname, '../renderer/index.html');
const devServerOrigin = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
const trusted: TrustedOrigins = { rendererIndexPath, devServerOrigin };

app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

function senderUrl(event: IpcMainInvokeEvent): string | undefined {
  const frame = event.senderFrame;
  // Only the top frame of the window may call the main process.
  if (!frame || frame !== event.sender.mainFrame) return undefined;
  return frame.url;
}

async function start(): Promise<void> {
  await app.whenReady();

  const registry = createIpcRegistry({
    isTrustedSender: (url) => isTrustedUrl(url, trusted),
    getActor: () => null,
    log: (entry) => console.warn('[ipc]', JSON.stringify(entry)),
  });
  registerHandlers(registry, app.getVersion());
  registry.assertComplete();
  registry.install(ipcMain, senderUrl);

  denyAllPermissions(session.defaultSession);

  if (devServerOrigin) {
    const csp = buildCsp('development', devServerOrigin);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
      });
    });
  }

  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents, trusted, (kind, url) =>
      console.warn('[security] blocked', kind, url),
    );
  });

  Menu.setApplicationMenu(null);
  const win = createWindow();

  const selfTestOut = process.env['HESBAN_SELFTEST_OUT'];
  if (process.env['HESBAN_SELFTEST'] === '1' && !app.isPackaged && selfTestOut) {
    win.webContents.once('did-finish-load', () => {
      void import('./selftest').then(async ({ runSelfTest }) => {
        await runSelfTest(win, selfTestOut);
        app.exit(0);
      });
    });
  }

  const uiCheckOut = process.env['HESBAN_UICHECK_OUT'];
  if (process.env['HESBAN_UICHECK'] === '1' && !app.isPackaged && uiCheckOut) {
    win.webContents.once('did-finish-load', () => {
      void import('./uicheck').then(async ({ runUiCheck }) => {
        await runUiCheck(win, uiCheckOut);
        app.exit(0);
      });
    });
  }

  app.on('window-all-closed', () => app.quit());
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: secureWebPreferences(
      join(import.meta.dirname, '../preload/index.cjs'),
      app.isPackaged,
    ),
  });
  win.once('ready-to-show', () => win.show());
  if (devServerOrigin) {
    void win.loadURL(devServerOrigin);
  } else {
    void win.loadFile(rendererIndexPath);
  }
  return win;
}
