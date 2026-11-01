import { z } from 'zod';

/**
 * Closed list of IPC channels. Every channel has a strict request and response schema.
 * The renderer can only reach channels listed here through the preload bridge.
 */
export const ipcContract = {
  'system:ping': {
    request: z.object({ nonce: z.string().min(1).max(64) }).strict(),
    response: z
      .object({ pong: z.literal(true), nonce: z.string(), appVersion: z.string() })
      .strict(),
  },
} as const;

export type ChannelName = keyof typeof ipcContract;
export type RequestOf<C extends ChannelName> = z.infer<(typeof ipcContract)[C]['request']>;
export type ResponseOf<C extends ChannelName> = z.infer<(typeof ipcContract)[C]['response']>;

export type IpcErrorCode =
  'INVALID_SENDER' | 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INTERNAL';

export type IpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: { readonly code: IpcErrorCode; readonly correlationId: string };
    };

export const channelNames = Object.keys(ipcContract) as ChannelName[];
