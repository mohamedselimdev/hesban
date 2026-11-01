import type { Role } from '../../domain/permissions';

export interface SessionInfo {
  readonly userId: number;
  readonly role: Role;
  readonly startedAt: number;
}

interface StoredSession extends SessionInfo {
  lastActivity: number;
}

export interface SessionOptions {
  /** Inactivity after which a session ends. */
  readonly idleMs: number;
  /** Hard limit regardless of activity. */
  readonly maxMs: number;
  readonly now: () => number;
}

export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  idleMs: 15 * 60 * 1000,
  maxMs: 12 * 60 * 60 * 1000,
  now: () => Date.now(),
};

/**
 * Sessions live only in main-process memory, keyed by the id of the window that logged in.
 * The renderer never holds a token or a role, so it cannot present or alter either.
 */
export function createSessionStore(options: Partial<SessionOptions> = {}) {
  const opts = { ...DEFAULT_SESSION_OPTIONS, ...options };
  const sessions = new Map<number, StoredSession>();

  const expired = (s: StoredSession, now: number) =>
    now - s.lastActivity > opts.idleMs || now - s.startedAt > opts.maxMs;

  return {
    /** Starts a session for a window, replacing any earlier one. */
    start(windowId: number, userId: number, role: Role): void {
      const now = opts.now();
      sessions.set(windowId, { userId, role, startedAt: now, lastActivity: now });
    },

    /** Returns the live session and counts the call as activity; null if absent or expired. */
    touch(windowId: number): SessionInfo | null {
      const session = sessions.get(windowId);
      if (!session) return null;
      const now = opts.now();
      if (expired(session, now)) {
        sessions.delete(windowId);
        return null;
      }
      session.lastActivity = now;
      return { userId: session.userId, role: session.role, startedAt: session.startedAt };
    },

    end(windowId: number): void {
      sessions.delete(windowId);
    },

    /** Ends every session of a user (after a role change, deactivation or password reset). */
    revokeUser(userId: number): number {
      let count = 0;
      for (const [id, s] of sessions) {
        if (s.userId === userId) {
          sessions.delete(id);
          count++;
        }
      }
      return count;
    },

    size(): number {
      return sessions.size;
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
