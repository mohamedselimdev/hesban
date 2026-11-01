import { fileURLToPath } from 'node:url';

/** Web preferences every HESBAN window must use. Tests pin these values. */
export function secureWebPreferences(preloadPath: string, isPackaged: boolean) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    experimentalFeatures: false,
    enableBlinkFeatures: '',
    devTools: !isPackaged,
    spellcheck: false,
  } as const;
}

export interface TrustedOrigins {
  /** Absolute filesystem path of the built renderer index.html (production). */
  readonly rendererIndexPath: string;
  /** Dev server origin such as http://localhost:5173 (development only). */
  readonly devServerOrigin?: string | undefined;
}

/** True only for the exact app page: the built index.html, or the dev server origin. */
export function isTrustedUrl(url: string | undefined, trusted: TrustedOrigins): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'file:') {
    if (parsed.search !== '' && parsed.search !== '?') {
      // query strings are never needed for the app page
      return false;
    }
    try {
      return normalizePath(fileURLToPath(parsed)) === normalizePath(trusted.rendererIndexPath);
    } catch {
      return false;
    }
  }
  if (trusted.devServerOrigin) {
    return parsed.origin === new URL(trusted.devServerOrigin).origin;
  }
  return false;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

export interface WebContentsLike {
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  on(event: string, listener: (event: { preventDefault(): void }, ...args: never[]) => void): void;
}

/** Applies navigation, window-open and webview restrictions to a web contents. */
export function hardenWebContents(
  contents: WebContentsLike,
  trusted: TrustedOrigins,
  onBlocked: (kind: string, url: string) => void = () => {},
): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const guardNavigation =
    (kind: string) =>
    (event: { preventDefault(): void }, ...args: never[]) => {
      const url = String(args[0] ?? '');
      if (!isTrustedUrl(url, trusted)) {
        event.preventDefault();
        onBlocked(kind, url);
      }
    };

  contents.on('will-navigate', guardNavigation('will-navigate'));
  contents.on('will-redirect', guardNavigation('will-redirect'));
  contents.on('will-frame-navigate', guardNavigation('will-frame-navigate'));
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    onBlocked('will-attach-webview', '');
  });
}

export interface SessionLike {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
    ) => void,
  ): void;
  setPermissionCheckHandler(handler: () => boolean): void;
  setDevicePermissionHandler(handler: () => boolean): void;
}

/** Denies every permission request and device grant. HESBAN needs none in v1. */
export function denyAllPermissions(session: SessionLike): void {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
}
