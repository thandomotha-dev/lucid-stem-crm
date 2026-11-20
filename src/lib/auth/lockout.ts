export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** Returns the new failure counter and lock time after one more failed login. */
export function nextFailureState(failedCount: number, now: Date): { failedCount: number; lockedUntil: Date | null } {
  const count = failedCount + 1;
  if (count >= MAX_FAILED_LOGINS) {
    return { failedCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) };
  }
  return { failedCount: count, lockedUntil: null };
}
