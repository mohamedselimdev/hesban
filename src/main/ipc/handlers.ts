import { defineHandler, type IpcRegistry } from './registry';

export function registerHandlers(registry: IpcRegistry, appVersion: string): void {
  registry.register(
    defineHandler({
      channel: 'system:ping',
      permission: null,
      handler: ({ nonce }) => ({ pong: true as const, nonce, appVersion }),
    }),
  );
}
