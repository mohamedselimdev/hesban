import { randomUUID } from 'node:crypto';
import {
  type ChannelName,
  type IpcErrorCode,
  type IpcResult,
  type RequestOf,
  type ResponseOf,
  channelNames,
  ipcContract,
} from '../../shared/contracts/ipc';

export interface Actor {
  readonly userId: number;
  readonly permissions: ReadonlySet<string>;
}

/** Minimal shape of an Electron IPC invoke event that the registry depends on. */
export interface IpcEventLike {
  readonly senderUrl: string | undefined;
  /** Id of the window that sent the call; sessions are bound to it. */
  readonly senderId?: number | undefined;
}

export interface RegistryDeps {
  isTrustedSender(url: string | undefined): boolean;
  getActor(event: IpcEventLike): Actor | null;
  log(entry: { channel: string; code: IpcErrorCode; correlationId: string; detail?: string }): void;
  /** Called when a trusted window is refused for lack of login or permission. */
  onDenied?(info: {
    channel: string;
    code: 'UNAUTHENTICATED' | 'FORBIDDEN';
    senderId: number;
  }): void;
}

export interface HandlerDefinition<C extends ChannelName> {
  readonly channel: C;
  /** null = public channel (no login needed). Otherwise the permission the actor must hold. */
  readonly permission: string | null;
  /** True for channels that need a signed-in user but no specific permission. */
  readonly requireLogin?: boolean;
  readonly handler: (
    input: RequestOf<C>,
    ctx: { actor: Actor | null; senderId: number },
  ) => Promise<ResponseOf<C>> | ResponseOf<C>;
}

export function defineHandler<C extends ChannelName>(
  definition: HandlerDefinition<C>,
): HandlerDefinition<C> {
  return definition;
}

interface StoredHandler {
  readonly channel: ChannelName;
  readonly permission: string | null;
  readonly requireLogin: boolean;
  readonly run: (
    input: unknown,
    ctx: { actor: Actor | null; senderId: number },
  ) => Promise<unknown>;
}

export interface IpcMainLike<E> {
  handle(channel: string, listener: (event: E, payload: unknown) => unknown): void;
}

export function createIpcRegistry(deps: RegistryDeps) {
  const handlers = new Map<string, StoredHandler>();

  function fail(channel: string, code: IpcErrorCode, detail?: string): IpcResult<never> {
    const correlationId = randomUUID();
    deps.log(
      detail === undefined
        ? { channel, code, correlationId }
        : { channel, code, correlationId, detail },
    );
    return { ok: false, error: { code, correlationId } };
  }

  return {
    register<C extends ChannelName>(definition: HandlerDefinition<C>): void {
      const channel: string = definition.channel;
      if (!Object.prototype.hasOwnProperty.call(ipcContract, channel)) {
        throw new Error(`channel not in contract: ${channel}`);
      }
      if (handlers.has(channel)) {
        throw new Error(`channel registered twice: ${channel}`);
      }
      handlers.set(channel, {
        channel: definition.channel,
        permission: definition.permission,
        requireLogin: definition.requireLogin ?? false,
        run: async (input, ctx) => definition.handler(input as RequestOf<C>, ctx),
      });
    },

    channels(): string[] {
      return [...handlers.keys()].sort();
    },

    /** Throws unless every contract channel has exactly one handler. */
    assertComplete(): void {
      const missing = channelNames.filter((c) => !handlers.has(c));
      if (missing.length > 0) {
        throw new Error(`contract channels without handler: ${missing.join(', ')}`);
      }
    },

    async invoke(
      channel: string,
      event: IpcEventLike,
      payload: unknown,
    ): Promise<IpcResult<unknown>> {
      const stored = handlers.get(channel);
      if (!stored) return fail(channel, 'INVALID_INPUT', 'unknown channel');

      if (!deps.isTrustedSender(event.senderUrl)) return fail(channel, 'INVALID_SENDER');

      const contract = ipcContract[stored.channel];
      const parsed = contract.request.safeParse(payload);
      if (!parsed.success) return fail(channel, 'INVALID_INPUT');

      const actor = deps.getActor(event);
      const senderId = event.senderId ?? -1;
      if (stored.permission !== null || stored.requireLogin) {
        if (!actor) {
          deps.onDenied?.({ channel, code: 'UNAUTHENTICATED', senderId });
          return fail(channel, 'UNAUTHENTICATED');
        }
        if (stored.permission !== null && !actor.permissions.has(stored.permission)) {
          deps.onDenied?.({ channel, code: 'FORBIDDEN', senderId });
          return fail(channel, 'FORBIDDEN');
        }
      }

      try {
        const output = await stored.run(parsed.data, { actor, senderId });
        const checked = contract.response.safeParse(output);
        if (!checked.success) return fail(channel, 'INTERNAL', 'response failed schema');
        return { ok: true, data: checked.data };
      } catch (error) {
        return fail(channel, 'INTERNAL', error instanceof Error ? error.name : 'unknown');
      }
    },

    /** Binds every registered handler to ipcMain.handle. The event is reduced to url and window id. */
    install<E>(
      ipcMain: IpcMainLike<E>,
      extractSender: (event: E) => { url: string | undefined; id: number },
    ): void {
      for (const channel of handlers.keys()) {
        ipcMain.handle(channel, (event: E, payload: unknown) => {
          const sender = extractSender(event);
          return this.invoke(channel, { senderUrl: sender.url, senderId: sender.id }, payload);
        });
      }
    },
  };
}

export type IpcRegistry = ReturnType<typeof createIpcRegistry>;
