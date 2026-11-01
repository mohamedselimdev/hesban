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
}

export interface RegistryDeps {
  isTrustedSender(url: string | undefined): boolean;
  getActor(event: IpcEventLike): Actor | null;
  log(entry: { channel: string; code: IpcErrorCode; correlationId: string; detail?: string }): void;
}

export interface HandlerDefinition<C extends ChannelName> {
  readonly channel: C;
  /** null = public channel (no login needed). Otherwise the permission the actor must hold. */
  readonly permission: string | null;
  readonly handler: (
    input: RequestOf<C>,
    ctx: { actor: Actor | null },
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
  readonly run: (input: unknown, ctx: { actor: Actor | null }) => Promise<unknown>;
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
      if (stored.permission !== null) {
        if (!actor) return fail(channel, 'UNAUTHENTICATED');
        if (!actor.permissions.has(stored.permission)) return fail(channel, 'FORBIDDEN');
      }

      try {
        const output = await stored.run(parsed.data, { actor });
        const checked = contract.response.safeParse(output);
        if (!checked.success) return fail(channel, 'INTERNAL', 'response failed schema');
        return { ok: true, data: checked.data };
      } catch (error) {
        return fail(channel, 'INTERNAL', error instanceof Error ? error.name : 'unknown');
      }
    },

    /** Binds every registered handler to ipcMain.handle. Event is reduced to its sender URL. */
    install<E>(ipcMain: IpcMainLike<E>, extractSenderUrl: (event: E) => string | undefined): void {
      for (const channel of handlers.keys()) {
        ipcMain.handle(channel, (event: E, payload: unknown) =>
          this.invoke(channel, { senderUrl: extractSenderUrl(event) }, payload),
        );
      }
    },
  };
}

export type IpcRegistry = ReturnType<typeof createIpcRegistry>;
