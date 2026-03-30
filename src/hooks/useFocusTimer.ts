import { useState, useEffect, useCallback, useRef } from "react";

export interface FocusTimerState {
  status: "idle" | "running" | "paused" | "completed";
  totalSeconds: number;
  remainingMs: number;
}

export function useFocusTimer() {
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [remainingMs, setRemainingMs] = useState(25 * 60 * 1000);
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");
  const [totalPausedMs, setTotalPausedMs] = useState(0);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const accumulatedPauseRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setPreset = useCallback((minutes: number) => {
    if (status !== "idle") return;
    setTotalSeconds(minutes * 60);
    setRemainingMs(minutes * 60 * 1000);
  }, [status]);

  const setCustomSeconds = useCallback((seconds: number) => {
    if (status !== "idle") return;
    setTotalSeconds(seconds);
    setRemainingMs(seconds * 1000);
  }, [status]);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    accumulatedPauseRef.current = 0;
    setTotalPausedMs(0);
    setStatus("running");
  }, []);

  const pause = useCallback(() => {
    if (status !== "running") return;
    pausedAtRef.current = Date.now();
    setStatus("paused");
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [status]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    const pauseDuration = Date.now() - pausedAtRef.current;
    accumulatedPauseRef.current += pauseDuration;
    setTotalPausedMs(accumulatedPauseRef.current);
    setStatus("running");
  }, [status]);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const elapsed = totalSeconds * 1000 - remainingMs;
    const durationMinutes = Math.round(elapsed / 60000);
    const breakMinutes = Math.floor(accumulatedPauseRef.current / 60000);
    setStatus("idle");
    setRemainingMs(totalSeconds * 1000);
    accumulatedPauseRef.current = 0;
    setTotalPausedMs(0);
    return { durationMinutes, breakMinutes, startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null };
  }, [totalSeconds, remainingMs]);

  useEffect(() => {
    if (status === "running") {
      const tick = () => {
        const elapsed = Date.now() - startTimeRef.current - accumulatedPauseRef.current;
        const remaining = totalSeconds * 1000 - elapsed;
        if (remaining <= 0) {
          setRemainingMs(0);
          setStatus("completed");
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }
        setRemainingMs(remaining);
      };
      intervalRef.current = setInterval(tick, 200);

      // Also check on visibility change (handles screen off / tab switch)
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          tick();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
  }, [status, totalSeconds]);

  const reset = useCallback(() => {
    setStatus("idle");
    setRemainingMs(totalSeconds * 1000);
    accumulatedPauseRef.current = 0;
    setTotalPausedMs(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [totalSeconds]);

  const restart = useCallback(() => {
    startTimeRef.current = Date.now();
    accumulatedPauseRef.current = 0;
    setTotalPausedMs(0);
    setRemainingMs(totalSeconds * 1000);
    setStatus("running");
  }, [totalSeconds]);

  return {
    status,
    totalSeconds,
    remainingMs,
    totalPausedMs,
    progress: totalSeconds > 0 ? 1 - remainingMs / (totalSeconds * 1000) : 0,
    setPreset,
    setCustomSeconds,
    start,
    pause,
    resume,
    stop,
    reset,
    restart,
  };
}
