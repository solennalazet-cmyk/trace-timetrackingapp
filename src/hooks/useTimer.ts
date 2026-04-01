import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type TimerMode = "stopwatch" | "focus" | "shift";
export type TimerStatus = "idle" | "running" | "paused";

interface TimerState {
  startedAt: string | null;
  pausedAt: string | null;
  totalPausedMs: number;
}

const LS_KEYS: Record<string, string> = {
  stopwatch: "trace_active_stopwatch",
  shift: "trace_active_shift",
};

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

export function useTimer(mode: TimerMode) {
  const { user } = useAuth();
  const lsKey = LS_KEYS[mode] || LS_KEYS.stopwatch;
  const stoppedRef = useRef(false);

  // Initialize from localStorage synchronously
  const initial = readLS(lsKey);
  const [timerState, setTimerState] = useState<TimerState>(
    initial ?? { startedAt: null, pausedAt: null, totalPausedMs: 0 }
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status: TimerStatus = !timerState.startedAt
    ? "idle"
    : timerState.pausedAt
    ? "paused"
    : "running";

  // Compute elapsed
  const computeElapsed = useCallback(() => {
    if (!timerState.startedAt) return 0;
    if (timerState.pausedAt) {
      return (
        new Date(timerState.pausedAt).getTime() -
        new Date(timerState.startedAt).getTime() -
        timerState.totalPausedMs
      );
    }
    return (
      Date.now() -
      new Date(timerState.startedAt).getTime() -
      timerState.totalPausedMs
    );
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

  // Sync with Supabase on load for authenticated users
  useEffect(() => {
    if (!user || mode === "focus") return;
    const syncFromSupabase = async () => {
      const { data } = await supabase
        .from("active_sessions")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        const sessionType = mode === "shift" ? "shift" : "stopwatch";
        if (data.session_type === sessionType) {
          const supabaseState: TimerState = {
            startedAt: data.started_at,
            pausedAt: data.paused_at,
            totalPausedMs: data.total_paused_ms ?? 0,
          };
          // Use earlier startedAt
          const lsState = readLS(lsKey);
          if (lsState?.startedAt) {
            const lsTime = new Date(lsState.startedAt).getTime();
            const sbTime = new Date(data.started_at).getTime();
            if (sbTime < lsTime) {
              setTimerState(supabaseState);
              writeLS(lsKey, supabaseState);
            }
          } else {
            setTimerState(supabaseState);
            writeLS(lsKey, supabaseState);
          }
        }
      }
    };
    syncFromSupabase();
  }, [user, mode, lsKey]);

  const start = useCallback(() => {
    const now = new Date().toISOString();
    const state: TimerState = {
      startedAt: now,
      pausedAt: null,
      totalPausedMs: 0,
    };
    // Synchronous localStorage write FIRST
    writeLS(lsKey, state);
    setTimerState(state);

    // Supabase upsert for authenticated users
    if (user) {
      const sessionType = mode === "shift" ? "shift" : "stopwatch";
      supabase
        .from("active_sessions")
        .upsert(
          {
            user_id: user.id,
            session_type: sessionType,
            started_at: now,
            paused_at: null,
            total_paused_ms: 0,
          },
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
      supabase
        .from("active_sessions")
        .update({ paused_at: now })
        .eq("user_id", user.id)
        .then();
    }
  }, [timerState, lsKey, user]);

  const resume = useCallback(() => {
    if (!timerState.pausedAt) return;
    const pauseDuration =
      Date.now() - new Date(timerState.pausedAt).getTime();
    const newTotal = timerState.totalPausedMs + pauseDuration;
    const updated: TimerState = {
      ...timerState,
      pausedAt: null,
      totalPausedMs: newTotal,
    };
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

  const stop = useCallback(() => {
    const durationMinutes = Math.round(elapsedMs / 60000);
    const breakMinutes = Math.round(timerState.totalPausedMs / 60000);
    const startedAt = timerState.startedAt;

    clearLS(lsKey);
    setTimerState({ startedAt: null, pausedAt: null, totalPausedMs: 0 });

    if (user) {
      supabase
        .from("active_sessions")
        .delete()
        .eq("user_id", user.id)
        .then();
    }

    return { durationMinutes, breakMinutes, startedAt };
  }, [elapsedMs, timerState, lsKey, user]);

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
