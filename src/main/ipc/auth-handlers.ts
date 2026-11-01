import { rolePermissions } from '../../domain/permissions';
import type { SessionStore } from '../../application/auth/session-store';
import type {
  Actor as ServiceActor,
  AuthResult,
  AuthService,
} from '../../infrastructure/auth/auth-service';
import { verifyAuditChain } from '../../infrastructure/db/audit-log';
import type { Db } from '../../infrastructure/db/open';
import { defineHandler, type Actor as IpcActor, type IpcRegistry } from './registry';

export interface AuthHandlerDeps {
  readonly db: Db;
  readonly auth: AuthService;
  readonly sessions: SessionStore;
}

/** Converts a service result into the shape the contract allows (no extra keys leak out). */
function shape<T, U>(result: AuthResult<T>, map: (value: T) => U) {
  if (result.ok) return { ok: true as const, value: map(result.value) };
  const out: {
    ok: false;
    error: Exclude<typeof result, { ok: true }>['error'];
    retryAfterSeconds?: number;
    violations?: Extract<typeof result, { error: 'POLICY' }>['violations'];
  } = { ok: false, error: result.error };
  if (result.error === 'LOCKED') out.retryAfterSeconds = result.retryAfterSeconds;
  if (result.error === 'POLICY') out.violations = result.violations;
  return out;
}

export function permissionsFor(session: {
  role: keyof typeof rolePermissions;
}): ReadonlySet<string> {
  return rolePermissions[session.role];
}

export function registerAuthHandlers(registry: IpcRegistry, deps: AuthHandlerDeps): void {
  const { auth, sessions, db } = deps;

  /** Actor for service calls. The service re-reads the role from the database. */
  const asActor = (actor: IpcActor | null): ServiceActor => ({ userId: actor?.userId ?? -1 });

  registry.register(
    defineHandler({
      channel: 'auth:status',
      permission: null,
      handler: (_input, { senderId }) => {
        const session = sessions.touch(senderId);
        return {
          hasUsers: auth.hasUsers(),
          user: session ? auth.getUser(session.userId) : null,
        };
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'auth:setup',
      permission: null,
      handler: async (input, { senderId }) => {
        const result = await auth.createFirstOwner(input);
        if (result.ok) sessions.start(senderId, result.value.user.id, 'owner');
        return shape(result, (v) => ({ user: v.user, recoveryKey: v.recoveryKey }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'auth:login',
      permission: null,
      handler: async (input, { senderId }) => {
        const result = await auth.login(input);
        if (result.ok) sessions.start(senderId, result.value.id, result.value.role);
        return shape(result, (user) => ({ user }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'auth:login-pin',
      permission: null,
      handler: async (input, { senderId }) => {
        const result = await auth.loginWithPin(input);
        if (result.ok) sessions.start(senderId, result.value.id, result.value.role);
        return shape(result, (user) => ({ user }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'auth:logout',
      permission: null,
      handler: (_input, { senderId }) => {
        sessions.end(senderId);
        return { done: true as const };
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'auth:change-password',
      permission: null,
      requireLogin: true,
      handler: async (input, { actor }) => {
        const result = await auth.changeOwnPassword(actor?.userId ?? -1, input.current, input.next);
        return shape(result, () => ({ changed: true as const }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'users:list',
      permission: 'users.manage',
      handler: (_input, { actor }) => {
        const result = auth.listUsers(asActor(actor));
        return { users: result.ok ? result.value : [] };
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'users:create',
      permission: 'users.manage',
      handler: async (input, { actor }) => {
        const result = await auth.createUser(asActor(actor), input);
        return shape(result, (user) => ({ user }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'users:reset-password',
      permission: 'users.manage',
      handler: async (input, { actor }) => {
        const result = await auth.resetPassword(asActor(actor), input.userId, input.newPassword);
        if (result.ok) sessions.revokeUser(result.value.revokeUserId);
        return shape(result, () => ({ reset: true as const }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'users:set-role',
      permission: 'users.manage',
      handler: async (input, { actor }) => {
        const result = await auth.setRole(asActor(actor), input.userId, input.role);
        if (result.ok) sessions.revokeUser(result.value.revokeUserId);
        return shape(result, () => ({ changed: true as const }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'users:deactivate',
      permission: 'users.manage',
      handler: async (input, { actor }) => {
        const result = await auth.deactivate(asActor(actor), input.userId);
        if (result.ok) sessions.revokeUser(result.value.revokeUserId);
        return shape(result, () => ({ deactivated: true as const }));
      },
    }),
  );

  registry.register(
    defineHandler({
      channel: 'audit:verify',
      permission: 'audit.view',
      handler: () => {
        const verdict = verifyAuditChain(db);
        return verdict.ok
          ? { ok: true as const, rows: verdict.rows }
          : { ok: false as const, brokenAtId: verdict.brokenAtId, reason: verdict.reason };
      },
    }),
  );
}
