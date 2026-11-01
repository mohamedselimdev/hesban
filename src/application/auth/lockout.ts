export const FREE_ATTEMPTS = 5;
export const BASE_LOCK_SECONDS = 30;
export const MAX_LOCK_SECONDS = 15 * 60;

/**
 * Seconds to lock after the given number of consecutive failures: none for the first five, then
 * 30 s, doubling for each further failure, capped at 15 minutes.
 */
export function lockSecondsAfter(failedAttempts: number): number {
  if (!Number.isInteger(failedAttempts) || failedAttempts < 0) {
    throw new RangeError('failedAttempts must be a non-negative integer');
  }
  if (failedAttempts < FREE_ATTEMPTS) return 0;
  const doublings = failedAttempts - FREE_ATTEMPTS;
  return Math.min(MAX_LOCK_SECONDS, BASE_LOCK_SECONDS * 2 ** Math.min(doublings, 16));
}

export function lockedUntil(failedAttempts: number, now: Date): Date | null {
  const seconds = lockSecondsAfter(failedAttempts);
  return seconds === 0 ? null : new Date(now.getTime() + seconds * 1000);
}

/** Seconds still to wait, rounded up, or 0 when not locked. */
export function secondsRemaining(lockedUntilIso: string | null, now: Date): number {
  if (!lockedUntilIso) return 0;
  const ms = new Date(lockedUntilIso).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}
