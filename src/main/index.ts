import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { buildCsp } from './csp';
import { rolePermissions } from '../domain/permissions';
import { createSessionStore } from '../application/auth/session-store';
import { createAuthService } from '../infrastructure/auth/auth-service';
import { appendAudit } from '../infrastructure/db/audit-log';
import { openAppDatabase, type AppDatabase } from '../infrastructure/db/database-service';
import { registerAuthHandlers } from './ipc/auth-handlers';
import { registerHandlers } from './ipc/handlers';
import { createIpcRegistry } from './ipc/registry';
import { electronKeyWrapper } from './safe-storage';
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

function senderInfo(event: IpcMainInvokeEvent): { url: string | undefined; id: number } {
  const frame = event.senderFrame;
  // Only the top frame of the window may call the main process.
  const url = !frame || frame !== event.sender.mainFrame ? undefined : frame.url;
  return { url, id: event.sender.id };
}

/** Arabic message with a stable code only; never key material or file contents. */
function showStartupFailure(error: unknown): void {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'UNKNOWN';
  dialog.showErrorBox(
    'حسبان',
    `تعذّر فتح قاعدة البيانات المشفّرة.
رمز الخطأ: ${code}
لا تحذف أي ملف. استعد نسخة احتياطية مشفّرة أو تواصل مع الدعم.`,
  );
}

async function start(): Promise<void> {
  await app.whenReady();

  let database: AppDatabase;
  try {
    database = await openAppDatabase({ dir: app.getPath('userData'), wrapper: electronKeyWrapper });
  } catch (error) {
    showStartupFailure(error);
    app.exit(1);
    return;
  }
  app.on('will-quit', () => database.close());

  const sessions = createSessionStore();
  const auth = createAuthService({ db: database.db });

  const registry = createIpcRegistry({
    isTrustedSender: (url) => isTrustedUrl(url, trusted),
    getActor: (event) => {
      const session = sessions.touch(event.senderId ?? -1);
      return session
        ? { userId: session.userId, permissions: rolePermissions[session.role] }
        : null;
    },
    log: (entry) => console.warn('[ipc]', JSON.stringify(entry)),
    onDenied: ({ channel, code, senderId }) => {
      const session = sessions.touch(senderId);
      appendAudit(database.db, {
        actorId: session?.userId ?? null,
        action: 'permission.denied',
        details: { channel, code },
      });
    },
  });
  registerHandlers(registry, app.getVersion());
  registerAuthHandlers(registry, { db: database.db, auth, sessions });
  registry.assertComplete();
  registry.install(ipcMain, senderInfo);

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
  const windowId = win.webContents.id;
  win.on('closed', () => sessions.end(windowId));

  // Test probes exist only in builds made with HESBAN_DEV_PROBES=1. In every other build the
  // compiler replaces this constant with false and drops the probe code entirely.
  if (__DEV_PROBES__) {
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
