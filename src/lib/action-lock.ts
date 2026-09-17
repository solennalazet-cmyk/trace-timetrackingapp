/**
 * Single-flight lock for user actions that write to the server.
 *
 * Prevents a double tap, a swipe followed by a button press, or a re-render
 * from firing the same write twice. The second caller gets the result of the
 * first one instead of sending another request.
 */

const inFlight = new Map<string, Promise<unknown>>();

export function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = (async () => {
    try {
      return await task();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, run);
  return run;
}

export function isActionInFlight(key: string): boolean {
  return inFlight.has(key);
}

export function resetActionLocks(key?: string) {
  if (key) inFlight.delete(key);
  else inFlight.clear();
}
