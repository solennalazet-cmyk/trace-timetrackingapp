import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  success: boolean;
  error?: string;
}

const LS_KEYS: Record<string, string> = {
  stopwatch: "trace_active_stopwatch",
  shift: "trace_active_shift",
};

const RECENTLY_STOPPED_KEY = "trace_recently_stopped";
const RECENTLY_STOPPED_TTL = 10_000; // 10 seconds

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

/** Persist a "recently stopped" marker for the given mode with a TTL */
function markRecentlyStopped(mode: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(RECENTLY_STOPPED_KEY) || "{}");
    existing[mode] = Date.now() + RECENTLY_STOPPED_TTL;
    localStorage.setItem(RECENTLY_STOPPED_KEY, JSON.stringify(existing));
    console.log(`[useTimer] markRecentlyStopped: ${mode}, expires in ${RECENTLY_STOPPED_TTL}ms`);
  } catch {}
}

/** Check if a mode was recently stopped (survives reloads) */
function isRecentlyStopped(mode: string): boolean {
  try {
    const existing = JSON.parse(localStorage.getItem(RECENTLY_STOPPED_KEY) || "{}");
    const expiry = existing[mode];
    if (expiry && Date.now() < expiry) {
      return true;
    }
    // Clean up expired entries
    if (expiry) {
      delete existing[mode];
      localStorage.setItem(RECENTLY_STOPPED_KEY, JSON.stringify(existing));
    }
  } catch {}
  return false;
}

export function useTimer(mode: TimerMode) {
  const { user } = useAuth();
  const lsKey = LS_KEYS[mode] || LS_KEYS.stopwatch;

  const initial = readLS(lsKey);
  const [timerState, setTimerState] = useState<TimerState>(
    initial ?? { startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] }
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const stoppingRef = useRef(false);

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

    // No authenticated user → no remote source of truth.
    // Clear any stale LS so a ghost timer can't survive across refreshes.
    if (!user) {
      const lsState = readLS(lsKey);
      if (lsState?.startedAt) {
        console.warn(`[useTimer] clearing LS ghost timer for ${mode}: no authenticated user`);
        clearLS(lsKey);
        setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
        setElapsedMs(0);
      }
      return;
    }

    const sessionType = mode === "shift" ? "shift" : "stopwatch";

    const reconcile = async () => {
      if (isRecentlyStopped(mode)) {
        console.log(`[useTimer] reconcile skipped: ${mode} was recently stopped`);
        return;
      }
      if (stoppingRef.current) {
        console.log(`[useTimer] reconcile skipped: stop in progress for ${mode}`);
        return;
      }
      console.log(`[useTimer] reconcile triggered for ${mode}`);
      const { data } = await supabase
        .from("active_sessions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      // No active session in Supabase → clear any stale LS for this mode
      if (!data) {
        const lsState = readLS(lsKey);
        if (lsState?.startedAt) {
          console.warn(`[useTimer] clearing stale LS for ${mode}: no Supabase session`);
          clearLS(lsKey);
          setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
          setElapsedMs(0);
        }
        return;
      }

      // Auto-clean stale sessions older than 18 hours (forgotten timers)
      const STALE_MS = 18 * 60 * 60 * 1000;
      const startedMs = new Date(data.started_at).getTime();
      if (Date.now() - startedMs > STALE_MS) {
        console.warn(`[useTimer] auto-cleaning stale ${data.session_type} session (>18h old)`);
        await supabase.from("active_sessions").delete().eq("user_id", user.id);
        clearLS(LS_KEYS.stopwatch);
        clearLS(LS_KEYS.shift);
        setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
        setElapsedMs(0);
        return;
      }

      // Supabase row is for a different mode → clear our LS if it has stale data
      if (data.session_type !== sessionType) {
        const lsState = readLS(lsKey);
        if (lsState?.startedAt) {
          console.warn(`[useTimer] clearing stale LS for ${mode}: Supabase has different session_type=${data.session_type}`);
          clearLS(lsKey);
          setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
          setElapsedMs(0);
        }
        return;
      }

      // Re-check after async
      if (isRecentlyStopped(mode) || stoppingRef.current) return;

      console.log(`[useTimer] active session restored from Supabase for ${mode}`);
      const supabaseState: TimerState = {
        startedAt: data.started_at,
        pausedAt: data.paused_at,
        totalPausedMs: data.total_paused_ms ?? 0,
        pauseIntervals: Array.isArray((data as any).pause_intervals) ? (data as any).pause_intervals : [],
      };
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
            clearLS(lsKey);
            setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
            setElapsedMs(0);
            return;
          }
          const row: any = payload.new;
          if (!row) return;
          if (row.session_type !== sessionType) {
            // A different mode is now active on another device → clear ours
            const lsState = readLS(lsKey);
            if (lsState?.startedAt) {
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
    };
  }, [user, mode, lsKey]);


  const start = useCallback(() => {
    const now = new Date().toISOString();
    const state: TimerState = { startedAt: now, pausedAt: null, totalPausedMs: 0 };
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
          { user_id: user.id, session_type: sessionType, started_at: now, paused_at: null, total_paused_ms: 0 },
          { onConflict: "user_id" }
        )
        .then();
    }
  }, [lsKey, user, mode]);

  const pause = useCallback(() => {
    const now = new Date().toISOString();
    const updated = { ...timerState, pausedAt: now };
    writeLS(lsKey, updated);
    setTimerState(updated);

    if (user) {
      supabase.from("active_sessions").update({ paused_at: now }).eq("user_id", user.id).then();
    }
  }, [timerState, lsKey, user]);

  const resume = useCallback(() => {
    if (!timerState.pausedAt) return;
    const pauseDuration = Date.now() - new Date(timerState.pausedAt).getTime();
    const newTotal = timerState.totalPausedMs + pauseDuration;
    const updated: TimerState = { ...timerState, pausedAt: null, totalPausedMs: newTotal };
    writeLS(lsKey, updated);
    setTimerState(updated);

    if (user) {
      supabase
        .from("active_sessions")
        .update({ paused_at: null, total_paused_ms: newTotal })
        .eq("user_id", user.id)
        .then();
    }
  }, [timerState, lsKey, user]);

  const stop = useCallback(async (): Promise<StopResult> => {
    console.log(`[useTimer] stop() called for ${mode}`);
    stoppingRef.current = true;

    const durationMinutes = Math.round(elapsedRef.current / 60000);
    const breakMinutes = Math.round(timerState.totalPausedMs / 60000);
    const startedAt = timerState.startedAt;

    // Mark recently stopped BEFORE clearing, survives reloads
    markRecentlyStopped(mode);

    // Clear local state immediately
    clearLS(lsKey);
    setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0, pauseIntervals: [] });
    setElapsedMs(0);

    // Await Supabase delete for authenticated users
    if (user) {
      console.log(`[useTimer] active_sessions delete started for ${mode}`);
      try {
        const { error } = await supabase
          .from("active_sessions")
          .delete()
          .eq("user_id", user.id);

        if (error) {
          console.error(`[useTimer] active_sessions delete failed for ${mode}:`, error);
          // Retry once
          console.log(`[useTimer] retrying active_sessions delete for ${mode}`);
          const { error: retryError } = await supabase
            .from("active_sessions")
            .delete()
            .eq("user_id", user.id);

          if (retryError) {
            console.error(`[useTimer] active_sessions delete retry also failed for ${mode}:`, retryError);
            stoppingRef.current = false;
            return {
              durationMinutes,
              breakMinutes,
              startedAt,
              success: false,
              error: "Failed to clean up active session. Please try again.",
            };
          }
        }
        console.log(`[useTimer] active_sessions delete succeeded for ${mode}`);
      } catch (err) {
        console.error(`[useTimer] active_sessions delete threw for ${mode}:`, err);
        stoppingRef.current = false;
        return {
          durationMinutes,
          breakMinutes,
          startedAt,
          success: false,
          error: "Network error cleaning up session. Please try again.",
        };
      }
    }

    stoppingRef.current = false;
    return { durationMinutes, breakMinutes, startedAt, success: true };
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
