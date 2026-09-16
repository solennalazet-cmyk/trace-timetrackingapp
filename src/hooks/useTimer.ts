import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { makeTimeEntryIdempotencyKey } from "@/lib/time-entry-idempotency";

export type TimerMode = "stopwatch" | "focus" | "shift";
export type TimerStatus = "idle" | "running" | "paused";

export interface PauseInterval {
  paused_at: string;
  resumed_at: string | null;
}

interface TimerState {
  startedAt: string | null;
  pausedAt: string | null;
  totalPausedMs: number;
  pauseIntervals: PauseInterval[];
}

export interface StopResult {
  durationMinutes: number;
  breakMinutes: number;
  startedAt: string | null;
  pauseIntervals: PauseInterval[];
  idempotencyKey: string;
  success: boolean;
  error?: string;
}

const LS_KEYS: Record<string, string> = {
  stopwatch: "trace_active_stopwatch",
  shift: "trace_active_shift",
};

const RECENTLY_STOPPED_KEY = "trace_recently_stopped";
const RECENTLY_STOPPED_TTL = 5 * 60_000; // 5 minutes — long enough for a slow delete + reload
const AUTH_GAP_GRACE_MS = 30_000;

function readLS(key: string): TimerState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLS(key: string, state: TimerState) {
  localStorage.setItem(key, JSON.stringify(state));
}

function clearLS(key: string) {
  localStorage.removeItem(key);
}

/**
 * Persist a "recently stopped" marker for the given mode, including the
 * startedAt of the session that was just closed. Reconcile uses this to
 * recognise and tear down a stale backend row instead of resurrecting a
 * session the user explicitly ended — the most common cause of which is a
 * failed/slow active_sessions delete followed by a reload.
 */
function markRecentlyStopped(mode: string, startedAt: string | null) {
  try {
    const existing = JSON.parse(localStorage.getItem(RECENTLY_STOPPED_KEY) || "{}");
    existing[mode] = { expires: Date.now() + RECENTLY_STOPPED_TTL, startedAt };
    localStorage.setItem(RECENTLY_STOPPED_KEY, JSON.stringify(existing));
    console.log(`[useTimer] markRecentlyStopped: ${mode} (started=${startedAt}), expires in ${RECENTLY_STOPPED_TTL}ms`);
  } catch {}
}

/**
 * Check if a mode was recently stopped. If `remoteStartedAt` is supplied and
 * matches the stopped session's startedAt, this is the stale backend row from
 * the session we just closed — caller should delete it, not restore it.
 */
function isRecentlyStopped(mode: string, remoteStartedAt?: string | null): boolean {
  try {
    const existing = JSON.parse(localStorage.getItem(RECENTLY_STOPPED_KEY) || "{}");
    const entry = existing[mode];
    if (!entry) return false;
    const expires = typeof entry === "number" ? entry : entry.expires;
    if (!expires || Date.now() >= expires) {
      delete existing[mode];
      localStorage.setItem(RECENTLY_STOPPED_KEY, JSON.stringify(existing));
      return false;
    }
    // Backwards-compat: old format was a bare timestamp (no startedAt).
    if (typeof entry === "number") return true;
    // If we know which session was stopped, only block restore when the
    // backend row is THAT session. A new session started after the stop
    // should be allowed to restore normally.
    if (remoteStartedAt && entry.startedAt && remoteStartedAt !== entry.startedAt) {
      return false;
    }
    return true;
  } catch {}
  return false;
}

/**
 * True when the local copy is the SAME session as the remote row but holds more
 * pause information (an extra pause interval, a longer paused total, or an open
 * pause the server never received). This happens whenever a pause/resume write
 * failed — offline, token gap, missing row. In that case the local copy wins and
 * gets pushed back to the server, so a pause is never silently dropped and the
 * session never reappears as "running" after a reload.
 */
function localPauseIsAhead(local: TimerState | null, remote: TimerState): boolean {
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

export function useTimer(mode: TimerMode) {
  const { user, loading: authLoading } = useAuth();
  const lsKey = LS_KEYS[mode] || LS_KEYS.stopwatch;

  const initial = readLS(lsKey);
  const [timerState, setTimerState] = useState<TimerState>(
    initial ?? { startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] }
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const stoppingRef = useRef(false);
  const noUserClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status: TimerStatus = !timerState.startedAt
    ? "idle"
    : timerState.pausedAt
    ? "paused"
    : "running";

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  const computeElapsed = useCallback(() => {
    if (!timerState.startedAt) return 0;
    if (timerState.pausedAt) {
      return (
        new Date(timerState.pausedAt).getTime() -
        new Date(timerState.startedAt).getTime() -
        timerState.totalPausedMs
      );
    }
    return Date.now() - new Date(timerState.startedAt).getTime() - timerState.totalPausedMs;
  }, [timerState]);

  // Tick
  useEffect(() => {
    if (status === "running") {
      setElapsedMs(computeElapsed());
      intervalRef.current = setInterval(() => {
        setElapsedMs(computeElapsed());
      }, 1000);
    } else if (status === "paused") {
      setElapsedMs(computeElapsed());
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else {
      setElapsedMs(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, computeElapsed]);

  // Sanity: if LS has a future-dated startedAt (clock skew / corruption), wipe it
  useEffect(() => {
    if (timerState.startedAt) {
      const startedMs = new Date(timerState.startedAt).getTime();
      if (isNaN(startedMs) || startedMs > Date.now() + 60_000) {
        console.warn(`[useTimer] clearing corrupt LS for ${mode} (startedAt=${timerState.startedAt})`);
        clearLS(lsKey);
        setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
        setElapsedMs(0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync with Supabase on load + realtime for cross-device consistency
  useEffect(() => {
    if (mode === "focus") return;

    // Auth still resolving → don't touch LS. The LS-restored state is our
    // optimistic source of truth until we know whether there's a user. Wiping
    // it here was the cause of the multi-second "appears clocked out" gap on
    // cold start, because user is null for the first render(s).
    if (authLoading) return;

    if (noUserClearTimerRef.current) {
      clearTimeout(noUserClearTimerRef.current);
      noUserClearTimerRef.current = null;
    }

    // No authenticated user → either an anonymous tracker or a token-refresh
    // gap. Never wipe a running timer here: losing hours of work is far worse
    // than showing a timer that will be reconciled as soon as auth resolves.
    // The session is re-upserted to the backend by reconcile() once `user`
    // becomes available again.
    if (!user) return;

    const sessionType = mode === "shift" ? "shift" : "stopwatch";

    const reconcile = async () => {
      if (stoppingRef.current) {
        console.log(`[useTimer] reconcile skipped: stop in progress for ${mode}`);
        return;
      }
      console.log(`[useTimer] reconcile triggered for ${mode}`);
      const { data, error } = await supabase
        .from("active_sessions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.warn(`[useTimer] reconcile kept local ${mode}: active session lookup failed`, error);
        return;
      }

      // The user explicitly stopped a session recently. If the backend still
      // has a row for THAT session (delete was slow or failed), tear it down
      // instead of resurrecting a session the user already ended. A different
      // session started after the stop is allowed to restore normally.
      if (data && isRecentlyStopped(mode, data.started_at)) {
        console.warn(`[useTimer] reconcile found stale backend row for recently-stopped ${mode}; deleting it`);
        await supabase.from("active_sessions").delete().eq("user_id", user.id);
        clearLS(lsKey);
        setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
        setElapsedMs(0);
        return;
      }

      // No active session in the backend. If localStorage still has a running
      // signed-in shift, preserve it and recreate the backend row instead of
      // clocking the user out because of a missed/failed upsert or transient gap.
      if (!data) {
        const lsState = readLS(lsKey);
        if (lsState?.startedAt) {
          console.warn(`[useTimer] backend session missing for ${mode}; preserving local timer and recreating row`);
          const { error: upsertError } = await supabase
            .from("active_sessions")
            .upsert(
              {
                user_id: user.id,
                session_type: sessionType,
                started_at: lsState.startedAt,
                paused_at: lsState.pausedAt,
                total_paused_ms: lsState.totalPausedMs ?? 0,
                pause_intervals: lsState.pauseIntervals ?? [],
              } as any,
              { onConflict: "user_id" }
            );
          if (upsertError) {
            console.warn(`[useTimer] failed to recreate backend session for ${mode}; local timer kept`, upsertError);
          }
        }
        return;
      }

      // Auto-clean stale sessions so a crashed/closed device doesn't leave a
      // phantom running timer that resurrects on the next login. Stopwatch
      // sessions older than 18h are cleared; shifts can legitimately run long
      // (night shifts, on-call) so they get a 48h threshold. The UI warns the
      // user after 24h and lets them choose when to clock out.
      const STALE_STOPWATCH_MS = 18 * 60 * 60 * 1000;
      const STALE_SHIFT_MS = 48 * 60 * 60 * 1000;
      const startedMs = new Date(data.started_at).getTime();
      const staleThreshold = data.session_type === "shift" ? STALE_SHIFT_MS : STALE_STOPWATCH_MS;
      if (data.session_type === sessionType && Number.isFinite(startedMs) && Date.now() - startedMs > staleThreshold) {
        console.warn(`[useTimer] auto-cleaning stale ${data.session_type} session (>${Math.round(staleThreshold / 3_600_000)}h old)`);
        await supabase.from("active_sessions").delete().eq("user_id", user.id);
        clearLS(lsKey);
        setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
        setElapsedMs(0);
        return;
      }

      // Supabase row is for a different mode → clear our LS if it has stale data
      if (data.session_type !== sessionType) {
        const lsState = readLS(lsKey);
        if (lsState?.startedAt) {
          const localStartedMs = new Date(lsState.startedAt).getTime();
          const remoteStartedMs = new Date(data.started_at).getTime();
          if (Number.isFinite(localStartedMs) && (!Number.isFinite(remoteStartedMs) || localStartedMs >= remoteStartedMs)) {
            console.warn(`[useTimer] backend has older/different session_type=${data.session_type}; preserving local ${mode}`);
            const { error: upsertError } = await supabase
              .from("active_sessions")
              .upsert(
                {
                  user_id: user.id,
                  session_type: sessionType,
                  started_at: lsState.startedAt,
                  paused_at: lsState.pausedAt,
                  total_paused_ms: lsState.totalPausedMs ?? 0,
                  pause_intervals: lsState.pauseIntervals ?? [],
                } as any,
                { onConflict: "user_id" }
              );
            if (upsertError) {
              console.warn(`[useTimer] failed to replace backend session for ${mode}; local timer kept`, upsertError);
            }
            return;
          }
          // Backend says another mode is running, but this device has a live
          // local session. Never silently clock the user out: keep the local
          // timer and make the backend match it.
          console.warn(`[useTimer] backend session_type=${data.session_type} differs; keeping local ${mode}`);
          await supabase.from("active_sessions").upsert(
            {
              user_id: user.id,
              session_type: sessionType,
              started_at: lsState.startedAt,
              paused_at: lsState.pausedAt,
              total_paused_ms: lsState.totalPausedMs ?? 0,
              pause_intervals: lsState.pauseIntervals ?? [],
            } as any,
            { onConflict: "user_id" }
          );

        }
        return;
      }

      // Re-check after async — guard against a stop that completed while we
      // were waiting on the network. Pass the backend row's startedAt so a
      // newly-started session is not blocked by an old stop marker.
      if (isRecentlyStopped(mode, data.started_at) || stoppingRef.current) return;

      const supabaseState: TimerState = {
        startedAt: data.started_at,
        pausedAt: data.paused_at,
        totalPausedMs: data.total_paused_ms ?? 0,
        pauseIntervals: Array.isArray((data as any).pause_intervals) ? (data as any).pause_intervals : [],
      };

      // Same session, but this device knows about a pause the server missed →
      // keep the local (paused) copy and repair the server row.
      const localState = readLS(lsKey);
      if (localPauseIsAhead(localState, supabaseState) && localState) {
        console.warn(`[useTimer] local pause state ahead of backend for ${mode}; keeping local and repairing row`);
        setTimerState(localState);
        const { error: repairError } = await supabase.from("active_sessions").upsert(
          {
            user_id: user.id,
            session_type: sessionType,
            started_at: localState.startedAt,
            paused_at: localState.pausedAt,
            total_paused_ms: localState.totalPausedMs ?? 0,
            pause_intervals: localState.pauseIntervals ?? [],
          } as any,
          { onConflict: "user_id" }
        );
        if (repairError) console.warn(`[useTimer] pause repair failed for ${mode}`, repairError);
        return;
      }

      console.log(`[useTimer] active session restored from Supabase for ${mode}`);
      setTimerState(supabaseState);
      writeLS(lsKey, supabaseState);
    };

    reconcile();

    // Realtime: another device stops/starts/updates → reflect here immediately
    const channel = supabase
      .channel(`active_sessions_${user.id}_${mode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "active_sessions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (stoppingRef.current) return;
          console.log(`[useTimer] realtime ${payload.eventType} for ${mode}`, payload);
          if (payload.eventType === "DELETE") {
            // Postgres only ships the primary key in `payload.old` unless the
            // table uses REPLICA IDENTITY FULL, so we usually CANNOT tell which
            // session was deleted. Wiping a running timer on that guess is what
            // clocked users out mid-shift. Never trust a DELETE blindly: keep
            // the local timer and only accept the clock-out if a saved time
            // entry proves the session was really closed (e.g. on another
            // device). Otherwise recreate the backend row.
            const lsState = readLS(lsKey);
            if (!lsState?.startedAt) {
              clearLS(lsKey);
              setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
              setElapsedMs(0);
              return;
            }
            const startedAtIso = lsState.startedAt;
            (async () => {
              if (stoppingRef.current || isRecentlyStopped(mode, startedAtIso)) return;
              const { data: closed, error: closedError } = await supabase
                .from("time_entries")
                .select("id")
                .eq("user_id", user.id)
                .eq("start_time", startedAtIso)
                .is("deleted_at", null)
                .limit(1);
              if (!closedError && closed && closed.length > 0) {
                console.warn(`[useTimer] DELETE confirmed by saved entry; clearing ${mode}`);
                clearLS(lsKey);
                setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
                setElapsedMs(0);
                return;
              }
              console.warn(`[useTimer] unconfirmed DELETE for ${mode}; keeping local timer and restoring backend row`);
              const current = readLS(lsKey);
              if (!current?.startedAt) return;
              await supabase.from("active_sessions").upsert(
                {
                  user_id: user.id,
                  session_type: sessionType,
                  started_at: current.startedAt,
                  paused_at: current.pausedAt,
                  total_paused_ms: current.totalPausedMs ?? 0,
                  pause_intervals: current.pauseIntervals ?? [],
                } as any,
                { onConflict: "user_id" }
              );
            })();
            return;
          }

          const row: any = payload.new;
          if (!row) return;
          if (row.session_type !== sessionType) {
            // A different mode is now active on another device → clear ours
            const lsState = readLS(lsKey);
            if (lsState?.startedAt) {
              const localStartedMs = new Date(lsState.startedAt).getTime();
              const remoteStartedMs = new Date(row.started_at).getTime();
              if (Number.isFinite(localStartedMs) && (!Number.isFinite(remoteStartedMs) || localStartedMs >= remoteStartedMs)) {
                supabase
                  .from("active_sessions")
                  .upsert(
                    {
                      user_id: user.id,
                      session_type: sessionType,
                      started_at: lsState.startedAt,
                      paused_at: lsState.pausedAt,
                      total_paused_ms: lsState.totalPausedMs ?? 0,
                      pause_intervals: lsState.pauseIntervals ?? [],
                    } as any,
                    { onConflict: "user_id" }
                  )
                  .then(({ error }) => {
                    if (error) console.warn(`[useTimer] realtime replace failed for ${mode}; local timer kept`, error);
                  });
                return;
              }
              clearLS(lsKey);
              setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
              setElapsedMs(0);
            }
            return;
          }
          const next: TimerState = {
            startedAt: row.started_at,
            pausedAt: row.paused_at,
            totalPausedMs: row.total_paused_ms ?? 0,
            pauseIntervals: Array.isArray(row.pause_intervals) ? row.pause_intervals : [],
          };
          setTimerState(next);
          writeLS(lsKey, next);
        }
      )
      .subscribe();

    // Reconcile when tab becomes visible again (covers cross-device stops without realtime)
    const onVis = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", reconcile);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", reconcile);
      if (noUserClearTimerRef.current) {
        clearTimeout(noUserClearTimerRef.current);
        noUserClearTimerRef.current = null;
      }
    };
  }, [user, authLoading, mode, lsKey]);

  // Heartbeat: while a session is running, keep the server copy alive every
  // 60s. If this device's localStorage gets evicted (iOS/PWA storage pressure,
  // cache clear) the session can still be recovered from the backend instead
  // of vanishing mid-shift.
  useEffect(() => {
    if (mode === "focus" || !user || !timerState.startedAt) return;
    const sessionType = mode === "shift" ? "shift" : "stopwatch";
    const beat = () => {
      const current = readLS(lsKey);
      if (!current?.startedAt || stoppingRef.current) return;
      supabase
        .from("active_sessions")
        .upsert(
          {
            user_id: user.id,
            session_type: sessionType,
            started_at: current.startedAt,
            paused_at: current.pausedAt,
            total_paused_ms: current.totalPausedMs ?? 0,
            pause_intervals: current.pauseIntervals ?? [],
          } as any,
          { onConflict: "user_id" }
        )
        .then(({ error }) => {
          if (error) console.warn(`[useTimer] heartbeat failed for ${mode}`, error);
        });
    };
    const id = setInterval(beat, 60_000);
    return () => clearInterval(id);
  }, [user, mode, lsKey, timerState.startedAt]);



  const start = useCallback(() => {
    const now = new Date().toISOString();
    const state: TimerState = { startedAt: now, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] };
    writeLS(lsKey, state);
    setTimerState(state);

    // Notify listeners (e.g. geolocation capture) that a session has started
    try {
      window.dispatchEvent(
        new CustomEvent("trace-timer-started", { detail: { mode, startedAt: now } })
      );
    } catch {}

    if (user) {
      const sessionType = mode === "shift" ? "shift" : "stopwatch";
      supabase
        .from("active_sessions")
        .upsert(
          { user_id: user.id, session_type: sessionType, started_at: now, paused_at: null, total_paused_ms: 0, pause_intervals: [] } as any,
          { onConflict: "user_id" }
        )
        .then();
    }
  }, [lsKey, user, mode]);

  // Pause/resume MUST upsert the whole session row, not patch it. A bare
  // `update()` silently affects 0 rows when the backend row is missing (first
  // write failed, offline, row cleaned elsewhere), so the pause never reaches
  // the server and the next reload restores a "still running" session.
  const persistState = useCallback(
    (state: TimerState) => {
      if (!user || mode === "focus" || !state.startedAt) return;
      const sessionType = mode === "shift" ? "shift" : "stopwatch";
      supabase
        .from("active_sessions")
        .upsert(
          {
            user_id: user.id,
            session_type: sessionType,
            started_at: state.startedAt,
            paused_at: state.pausedAt,
            total_paused_ms: state.totalPausedMs ?? 0,
            pause_intervals: state.pauseIntervals ?? [],
          } as any,
          { onConflict: "user_id" }
        )
        .then(({ error }) => {
          if (error) console.warn(`[useTimer] failed to persist pause state for ${mode}`, error);
        });
    },
    [user, mode]
  );

  const pause = useCallback(() => {
    const now = new Date().toISOString();
    const nextIntervals: PauseInterval[] = [
      ...(timerState.pauseIntervals ?? []),
      { paused_at: now, resumed_at: null },
    ];
    const updated: TimerState = { ...timerState, pausedAt: now, pauseIntervals: nextIntervals };
    writeLS(lsKey, updated);
    setTimerState(updated);
    persistState(updated);
  }, [timerState, lsKey, persistState]);

  const resume = useCallback(() => {
    if (!timerState.pausedAt) return;
    const now = new Date().toISOString();
    const pauseDuration = Date.now() - new Date(timerState.pausedAt).getTime();
    const newTotal = timerState.totalPausedMs + pauseDuration;
    const prev = timerState.pauseIntervals ?? [];
    const nextIntervals: PauseInterval[] = prev.length > 0 && prev[prev.length - 1].resumed_at == null
      ? [...prev.slice(0, -1), { ...prev[prev.length - 1], resumed_at: now }]
      : prev;
    const updated: TimerState = { ...timerState, pausedAt: null, totalPausedMs: newTotal, pauseIntervals: nextIntervals };
    writeLS(lsKey, updated);
    setTimerState(updated);
    persistState(updated);
  }, [timerState, lsKey, persistState]);

  const stop = useCallback(async (): Promise<StopResult> => {
    if (stoppingRef.current) {
      const startedAt = timerState.startedAt;
      return {
        durationMinutes: Math.round(elapsedRef.current / 60000),
        breakMinutes: Math.round(timerState.totalPausedMs / 60000),
        startedAt,
        pauseIntervals: timerState.pauseIntervals ?? [],
        idempotencyKey: makeTimeEntryIdempotencyKey("timer", user?.id ?? "anonymous", mode, startedAt ?? "no-start"),
        success: false,
        error: "Stop already in progress.",
      };
    }
    console.log(`[useTimer] stop() called for ${mode}`);
    stoppingRef.current = true;

    const durationMinutes = Math.round(elapsedRef.current / 60000);
    const breakMinutes = Math.round(timerState.totalPausedMs / 60000);
    const startedAt = timerState.startedAt;
    const idempotencyKey = makeTimeEntryIdempotencyKey("timer", user?.id ?? "anonymous", mode, startedAt ?? "no-start");
    // If still paused at stop time, close the open interval at now
    const nowIso = new Date().toISOString();
    const intervals = timerState.pauseIntervals ?? [];
    const pauseIntervals: PauseInterval[] = intervals.length > 0 && intervals[intervals.length - 1].resumed_at == null
      ? [...intervals.slice(0, -1), { ...intervals[intervals.length - 1], resumed_at: nowIso }]
      : intervals;

    // Mark recently stopped BEFORE clearing, survives reloads. Store the
    // startedAt so reconcile can recognise and delete the stale backend row
    // if the active_sessions delete is slow or fails.
    markRecentlyStopped(mode, startedAt);

    // Clear local state immediately
    clearLS(lsKey);
    setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
    setElapsedMs(0);

    // Fire-and-forget Supabase cleanup so the UI (assignment modal, etc.)
    // reacts instantly. `markRecentlyStopped` + cleared LS already protect
    // against the reconcile loop resurrecting the session. Retry once on
    // failure, and only surface a toast if both attempts fail.
    if (user) {
      const userId = user.id;
      (async () => {
        console.log(`[useTimer] active_sessions delete started for ${mode}`);
        try {
          const { error } = await supabase
            .from("active_sessions")
            .delete()
            .eq("user_id", userId);
          if (error) {
            console.error(`[useTimer] active_sessions delete failed for ${mode}:`, error);
            const { error: retryError } = await supabase
              .from("active_sessions")
              .delete()
              .eq("user_id", userId);
            if (retryError) {
              console.error(`[useTimer] active_sessions delete retry failed for ${mode}:`, retryError);
              try {
                const { toast } = await import("sonner");
                toast.error("Couldn't sync clock-out to the server. Your entry was saved locally.");
              } catch {}
              return;
            }
          }
          console.log(`[useTimer] active_sessions delete succeeded for ${mode}`);
        } catch (err) {
          console.error(`[useTimer] active_sessions delete threw for ${mode}:`, err);
        }
      })();
    }

    stoppingRef.current = false;
    return { durationMinutes, breakMinutes, startedAt, pauseIntervals, idempotencyKey, success: true };
  }, [timerState, lsKey, user, mode]);


  return {
    status,
    elapsedMs,
    startedAt: timerState.startedAt,
    pausedAt: timerState.pausedAt,
    totalPausedMs: timerState.totalPausedMs,
    start,
    pause,
    resume,
    stop,
  };
}

// Format elapsed ms to display string
export function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  if (totalMinutes >= 60) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Format duration_minutes to HH:MM for saved entries
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
