import type { IpcResult, RequestOf, ResponseOf } from '../shared/contracts/ipc';

export type Invoke = (channel: string, payload: unknown) => Promise<unknown>;

export interface HesbanApi {
  readonly system: {
    ping(nonce: RequestOf<'system:ping'>['nonce']): Promise<IpcResult<ResponseOf<'system:ping'>>>;
  };
}

/**
 * Builds the object exposed to the renderer. Takes `invoke` as a parameter so the
 * surface can be tested without Electron. Never exposes ipcRenderer itself.
 */
export function createApi(invoke: Invoke): HesbanApi {
  return Object.freeze({
    system: Object.freeze({
      ping: (nonce: string) =>
        invoke('system:ping', { nonce }) as Promise<IpcResult<ResponseOf<'system:ping'>>>,
    }),
  });
}
