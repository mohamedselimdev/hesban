import { z } from 'zod';

const username = z.string().min(3).max(64);
const password = z.string().min(1).max(128);
const displayName = z.string().trim().min(1).max(100);
const role = z.enum(['owner', 'manager', 'cashier']);
const userId = z.number().int().positive();

const publicUser = z
  .object({
    id: userId,
    username: z.string(),
    displayName: z.string(),
    role,
    mustChangePassword: z.boolean(),
  })
  .strict();

const policyViolation = z.enum([
  'TOO_SHORT',
  'TOO_LONG',
  'TOO_COMMON',
  'CONTAINS_USERNAME',
  'SINGLE_CHARACTER_REPEATED',
  'INVALID_CHARACTERS',
  'PIN_NOT_DIGITS',
  'PIN_TOO_SIMPLE',
]);

/** Outcome of an authentication or user-management call: success value or a stable error code. */
const authResult = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }).strict(),
    z
      .object({
        ok: z.literal(false),
        error: z.enum([
          'INVALID_CREDENTIALS',
          'LOCKED',
          'POLICY',
          'FORBIDDEN',
          'NOT_FOUND',
          'USERNAME_TAKEN',
          'FIRST_RUN_ALREADY_DONE',
          'INVALID_ROLE',
          'PIN_NOT_ALLOWED_FOR_ROLE',
        ]),
        retryAfterSeconds: z.number().int().nonnegative().optional(),
        violations: z.array(policyViolation).optional(),
      })
      .strict(),
  ]);

const empty = z.object({}).strict();

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
  'auth:status': {
    request: empty,
    response: z.object({ hasUsers: z.boolean(), user: publicUser.nullable() }).strict(),
  },
  'auth:setup': {
    request: z.object({ username, displayName, password }).strict(),
    response: authResult(z.object({ user: publicUser, recoveryKey: z.string() }).strict()),
  },
  'auth:login': {
    request: z.object({ username, password }).strict(),
    response: authResult(z.object({ user: publicUser }).strict()),
  },
  'auth:login-pin': {
    request: z.object({ username, pin: z.string().min(1).max(16) }).strict(),
    response: authResult(z.object({ user: publicUser }).strict()),
  },
  'auth:logout': {
    request: empty,
    response: z.object({ done: z.literal(true) }).strict(),
  },
  'auth:change-password': {
    request: z.object({ current: password, next: password }).strict(),
    response: authResult(z.object({ changed: z.literal(true) }).strict()),
  },
  'users:list': {
    request: empty,
    response: z
      .object({ users: z.array(publicUser.extend({ isActive: z.boolean() }).strict()) })
      .strict(),
  },
  'users:create': {
    request: z
      .object({
        username,
        displayName,
        role,
        password,
        pin: z.string().min(1).max(16).optional(),
      })
      .strict(),
    response: authResult(z.object({ user: publicUser }).strict()),
  },
  'users:reset-password': {
    request: z.object({ userId, newPassword: password }).strict(),
    response: authResult(z.object({ reset: z.literal(true) }).strict()),
  },
  'users:set-role': {
    request: z.object({ userId, role }).strict(),
    response: authResult(z.object({ changed: z.literal(true) }).strict()),
  },
  'users:deactivate': {
    request: z.object({ userId }).strict(),
    response: authResult(z.object({ deactivated: z.literal(true) }).strict()),
  },
  'audit:verify': {
    request: empty,
    response: z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true), rows: z.number().int().nonnegative() }).strict(),
      z.object({ ok: z.literal(false), brokenAtId: z.number().int(), reason: z.string() }).strict(),
    ]),
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
