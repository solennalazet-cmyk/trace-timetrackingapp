/**
 * Throttled single-flight guard for the assignment lists refresh.
 *
 * The recap can be opened/remounted several times in a row (recovery snapshot,
 * route guard, user tapping again). Without this guard each trigger fired its
 * own set of network requests, which is what made the client picker feel like
 * it re-opened and reloaded repeatedly.
 */

const lastRunAt = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

export const ASSIGNMENT_REFRESH_INTERVAL_MS = 30_000;

export function runAssignmentRefresh(
  userId: string,
  task: () => Promise<void>,
  options: { hasCache: boolean; intervalMs?: number } = { hasCache: false }
): Promise<void> | undefined {
  const interval = options.intervalMs ?? ASSIGNMENT_REFRESH_INTERVAL_MS;
  const last = lastRunAt.get(userId) ?? 0;
  if (Date.now() - last < interval && options.hasCache) return;

  const existing = inFlight.get(userId);
  if (existing) return existing;

  lastRunAt.set(userId, Date.now());
  const run = (async () => {
    try {
      await task();
    } catch (error) {
      // Allow an immediate retry after a failure.
      lastRunAt.delete(userId);
      throw error;
    } finally {
      inFlight.delete(userId);
    }
  })();
  inFlight.set(userId, run);
  return run;
}

export function resetAssignmentRefreshState(userId?: string) {
  if (userId) {
    lastRunAt.delete(userId);
    inFlight.delete(userId);
    return;
  }
  lastRunAt.clear();
  inFlight.clear();
}
