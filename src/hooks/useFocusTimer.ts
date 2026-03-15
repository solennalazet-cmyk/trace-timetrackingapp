import { useState, useEffect, useCallback, useRef } from "react";

export interface FocusTimerState {
  status: "idle" | "running" | "completed";
  totalSeconds: number;
  remainingMs: number;
}

export function useFocusTimer() {
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [remainingMs, setRemainingMs] = useState(25 * 60 * 1000);
  const [status, setStatus] = useState<"idle" | "running" | "completed">("idle");
  const startTimeRef = useRef<number>(0);
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
    setStatus("running");
  }, []);

  useEffect(() => {
    if (status === "running") {
      const tick = () => {
        const elapsed = Date.now() - startTimeRef.current;
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
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [status, totalSeconds]);

  const reset = useCallback(() => {
    setStatus("idle");
    setRemainingMs(totalSeconds * 1000);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [totalSeconds]);

  const restart = useCallback(() => {
    startTimeRef.current = Date.now();
    setRemainingMs(totalSeconds * 1000);
    setStatus("running");
  }, [totalSeconds]);

  return {
    status,
    totalSeconds,
    remainingMs,
    progress: totalSeconds > 0 ? 1 - remainingMs / (totalSeconds * 1000) : 0,
    setPreset,
    setCustomSeconds,
    start,
    reset,
    restart,
  };
}
