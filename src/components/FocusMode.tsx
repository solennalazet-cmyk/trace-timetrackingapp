import { useFocusTimer } from "@/hooks/useFocusTimer";
import CircularTimer from "./CircularTimer";
import { Button } from "@/components/ui/button";
import { useCallback, useRef, useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { playTimerSound } from "@/lib/timer-sounds";

interface FocusModeProps {
  onComplete: (data: { durationMinutes: number; breakMinutes: number; startedAt: string | null }) => void;
}

const PRESETS = [
  { label: "25m", minutes: 25 },
  { label: "45m", minutes: 45 },
  { label: "1h", minutes: 60 },
  { label: "1h 30m", minutes: 90 },
];

const BTN = "rounded-[28px] h-14 text-[16px] font-bold";

const FocusMode = ({ onComplete }: FocusModeProps) => {
  const {
    status,
    totalSeconds,
    remainingMs,
    totalPausedMs,
    progress,
    setPreset,
    setCustomSeconds,
    start,
    pause,
    resume,
    stop,
    reset,
    restart,
  } = useFocusTimer();

  const { user } = useAuth();
  const [timerSound, setTimerSound] = useState("chime");
  const prevStatusRef = useRef(status);

  // Load sound setting
  useEffect(() => {
    const loadSound = async () => {
      if (user) {
        const { data } = await supabase
          .from("user_settings")
          .select("timer_sound")
          .eq("user_id", user.id)
          .single();
        if (data?.timer_sound) setTimerSound(data.timer_sound);
      } else {
        try {
          const raw = localStorage.getItem("trace_user_settings");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.timer_sound) setTimerSound(parsed.timer_sound);
          }
        } catch {}
      }
    };
    loadSound();
  }, [user]);

  // Request notification permission when starting a focus session
  useEffect(() => {
    if (status === "running" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [status]);

  // Schedule a background notification using setTimeout for exact completion time
  useEffect(() => {
    if (status !== "running") return;
    const elapsed = Date.now() - (useFocusTimer as any).length; // not used, we compute below
    // Compute ms until completion
    const msUntilDone = remainingMs;
    if (msUntilDone <= 0) return;

    const notifTimeout = setTimeout(() => {
      // Show browser notification even if tab is backgrounded
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Focus session complete!", {
            body: "Your timer has finished. Time to assign your work.",
            icon: "/favicon.ico",
            tag: "focus-timer-complete",
          });
        } catch {}
      }
    }, msUntilDone);

    return () => clearTimeout(notifTimeout);
  }, [status, remainingMs]);

  // Play sound when status transitions to "completed"
  useEffect(() => {
    if (prevStatusRef.current !== "completed" && status === "completed") {
      playTimerSound(timerSound);
    }
    prevStatusRef.current = status;
  }, [status, timerSound]);

  const svgRef = useRef<SVGSVGElement>(null);

  const formatCountdown = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (status !== "idle" || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) + Math.PI / 2;
      let normalized = angle < 0 ? angle + 2 * Math.PI : angle;
      if (normalized > 2 * Math.PI) normalized -= 2 * Math.PI;
      const fraction = normalized / (2 * Math.PI);
      const minutes = Math.max(1, Math.round(fraction * 120));
      setCustomSeconds(minutes * 60);
    },
    [status, setCustomSeconds]
  );

  const handleStop = () => {
    const result = stop();
    onComplete(result);
  };

  const handleAssign = () => {
    const durationMinutes = Math.round(totalSeconds / 60);
    reset();
    onComplete({ durationMinutes, breakMinutes: 0, startedAt: null });
  };

  const pauseMinutes = Math.floor(totalPausedMs / 60000);

  return (
    <div className="flex flex-col items-center gap-6">
      <div onPointerMove={status === "idle" ? (e) => {
        if (e.buttons === 1) handleDrag(e);
      } : undefined}>
        <CircularTimer
          progress={status === "idle" ? totalSeconds / (120 * 60) : (status === "running" || status === "paused") ? 1 - progress : 0}
          arcColor="hsl(53, 98%, 77%)"
          pulsing={status === "running"}
          dimmed={status === "paused"}
        >
          <svg ref={svgRef} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <span className="font-mono text-4xl font-bold text-timer-display">
            {status === "idle"
              ? `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
              : status === "running" || status === "paused"
              ? formatCountdown(remainingMs)
              : "Done!"}
          </span>
          <span className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">
            {status === "idle" && "Set duration"}
            {status === "running" && "Focus"}
            {status === "paused" && `Paused · ${pauseMinutes}m break`}
            {status === "completed" && "Session complete"}
          </span>
        </CircularTimer>
      </div>

      {status === "idle" && (
        <>
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.minutes}
                variant={totalSeconds === p.minutes * 60 ? "default" : "outline"}
                size="sm"
                onClick={() => setPreset(p.minutes)}
                className={totalSeconds === p.minutes * 60 ? "bg-primary text-primary-foreground" : ""}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Button
            onClick={start}
            className={`w-full max-w-[280px] bg-primary text-primary-foreground hover:bg-primary/90 ${BTN}`}
          >
            Start Focus
          </Button>
        </>
      )}

      {status === "running" && (
        <div className="flex gap-3 w-full max-w-[280px]">
          <Button
            onClick={pause}
            variant="outline"
            className={`flex-1 text-timer-display ${BTN}`}
            style={{
              background: "rgba(255, 255, 255, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
            }}
          >
            <Pause className="w-4 h-4 mr-2" />
            Pause
          </Button>
          <Button
            onClick={handleStop}
            className={`flex-1 bg-primary text-primary-foreground hover:bg-primary/90 ${BTN}`}
          >
            <Square className="w-4 h-4 mr-2" />
            Stop
          </Button>
        </div>
      )}

      {status === "paused" && (
        <div className="flex gap-3 w-full max-w-[280px]">
          <Button
            onClick={resume}
            className={`flex-1 bg-primary text-primary-foreground hover:bg-primary/90 ${BTN}`}
          >
            <Play className="w-4 h-4 mr-2" />
            Resume
          </Button>
          <Button
            onClick={handleStop}
            variant="outline"
            className={`flex-1 text-timer-display ${BTN}`}
            style={{
              background: "rgba(255, 255, 255, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.6)",
            }}
          >
            <Square className="w-4 h-4 mr-2" />
            Stop
          </Button>
        </div>
      )}

      {status === "completed" && (
        <div className="flex gap-3 w-full max-w-[280px]">
          <Button onClick={restart} variant="outline" className={`flex-1 ${BTN}`}>
            Restart
          </Button>
          <Button
            onClick={handleAssign}
            className={`flex-1 bg-primary text-primary-foreground hover:bg-primary/90 ${BTN}`}
          >
            Assign Work
          </Button>
        </div>
      )}
    </div>
  );
};

export default FocusMode;
