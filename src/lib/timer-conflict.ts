/**
 * Conflict resolution between the copy of a running session held on the device
 * and the copy that comes back from the server (initial load or realtime).
 *
 * The server answer can arrive late — after the user already paused or resumed.
 * When that happens the older server copy must never win, or the pause the user
 * just made silently disappears.
 */

export interface PauseInterval {
  paused_at: string;
  resumed_at: string | null;
}

export interface TimerLikeState {
  startedAt: string | null;
  pausedAt: string | number | null;
  totalPausedMs: number;
  pauseIntervals?: PauseInterval[];
}

/**
 * True when the local copy is the SAME session as the remote row but holds more
 * pause information (an extra pause interval, a longer paused total, or an open
 * pause the server never received). This happens whenever a pause/resume write
 * failed — offline, token gap, missing row. In that case the local copy wins and
 * gets pushed back to the server, so a pause is never silently dropped and the
 * session never reappears as "running" after a reload.
 */
export function localPauseIsAhead(
  local: TimerLikeState | null,
  remote: TimerLikeState
): boolean {
  if (!local?.startedAt || !remote.startedAt) return false;
  if (local.startedAt !== remote.startedAt) return false;
  const localCount = local.pauseIntervals?.length ?? 0;
  const remoteCount = remote.pauseIntervals?.length ?? 0;
  if (localCount !== remoteCount) return localCount > remoteCount;
  const localTotal = local.totalPausedMs ?? 0;
  const remoteTotal = remote.totalPausedMs ?? 0;
  if (localTotal !== remoteTotal) return localTotal > remoteTotal;
  return !!local.pausedAt && !remote.pausedAt;
}

/**
 * A server answer is stale when the user changed the session locally after the
 * request that produced it was sent. Compare the local mutation counter taken
 * when the request started with its value now.
 */
export function isStaleServerResponse(
  mutationAtRequestStart: number,
  mutationNow: number
): boolean {
  return mutationNow !== mutationAtRequestStart;
}
