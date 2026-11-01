import type { ChannelName, IpcResult, RequestOf, ResponseOf } from '../shared/contracts/ipc';

export type Invoke = (channel: string, payload: unknown) => Promise<unknown>;

type Call<C extends ChannelName> = Promise<IpcResult<ResponseOf<C>>>;

export interface HesbanApi {
  readonly system: {
    ping(nonce: RequestOf<'system:ping'>['nonce']): Call<'system:ping'>;
  };
  readonly auth: {
    status(): Call<'auth:status'>;
    setup(input: RequestOf<'auth:setup'>): Call<'auth:setup'>;
    login(input: RequestOf<'auth:login'>): Call<'auth:login'>;
    loginPin(input: RequestOf<'auth:login-pin'>): Call<'auth:login-pin'>;
    logout(): Call<'auth:logout'>;
    changePassword(input: RequestOf<'auth:change-password'>): Call<'auth:change-password'>;
  };
  readonly users: {
    list(): Call<'users:list'>;
    create(input: RequestOf<'users:create'>): Call<'users:create'>;
    resetPassword(input: RequestOf<'users:reset-password'>): Call<'users:reset-password'>;
    setRole(input: RequestOf<'users:set-role'>): Call<'users:set-role'>;
    deactivate(input: RequestOf<'users:deactivate'>): Call<'users:deactivate'>;
  };
  readonly audit: {
    verify(): Call<'audit:verify'>;
  };
}

/**
 * Builds the object exposed to the renderer. Takes `invoke` as a parameter so the
 * surface can be tested without Electron. Never exposes ipcRenderer itself.
 */
export function createApi(invoke: Invoke): HesbanApi {
  const send = <C extends ChannelName>(channel: C, payload: RequestOf<C>) =>
    invoke(channel, payload) as Call<C>;

  const api: HesbanApi = {
    system: { ping: (nonce) => send('system:ping', { nonce }) },
    auth: {
      status: () => send('auth:status', {}),
      setup: (input) => send('auth:setup', input),
      login: (input) => send('auth:login', input),
      loginPin: (input) => send('auth:login-pin', input),
      logout: () => send('auth:logout', {}),
      changePassword: (input) => send('auth:change-password', input),
    },
    users: {
      list: () => send('users:list', {}),
      create: (input) => send('users:create', input),
      resetPassword: (input) => send('users:reset-password', input),
      setRole: (input) => send('users:set-role', input),
      deactivate: (input) => send('users:deactivate', input),
    },
    audit: { verify: () => send('audit:verify', {}) },
  };
  for (const group of Object.values(api)) Object.freeze(group);
  return Object.freeze(api);
}
