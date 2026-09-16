import { useEffect, useState } from "react";
import { useTimer, formatTimer } from "@/hooks/useTimer";
import CircularTimer from "./CircularTimer";
import { Button } from "@/components/ui/button";
import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";

const BTN = "rounded-[28px] h-14 text-[16px] font-bold";

interface StopwatchModeProps {
  onStop: (data: { durationMinutes: number; breakMinutes: number; startedAt: string | null; pauseIntervals?: { paused_at: string; resumed_at: string | null }[]; idempotencyKey?: string }) => void;
}

const StopwatchMode = ({ onStop }: StopwatchModeProps) => {
  const { status, elapsedMs, totalPausedMs, pausedAt, start, pause, resume, stop } = useTimer("stopwatch");
  const [pulse, setPulse] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    const handler = () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 2800);
    };
    window.addEventListener("trace-onboard-pulse-start", handler);
    return () => window.removeEventListener("trace-onboard-pulse-start", handler);
  }, []);

  useEffect(() => {
    if (status === "idle" || status === "running") setStopping(false);
  }, [status]);

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    const result = await stop();
    if (!result.success) {
      toast.error(result.error || "Failed to stop session. Please try again.");
      setStopping(false);
      return;
    }
    onStop(result);
  };

  const pauseMinutes = Math.floor(totalPausedMs / 60000);

  return (
    <div className="flex flex-col items-center gap-6">
      <CircularTimer
        progress={status === "running" ? Math.min(elapsedMs / 3600000, 1) : 0}
        pulsing={status === "running"}
        dimmed={status === "paused"}
      >
        <span className="font-mono text-4xl font-bold text-timer-display">
          {status === "idle" ? "00:00" : formatTimer(elapsedMs)}
        </span>
        <span className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">
          {status === "idle" && "Ready"}
          {status === "running" && "Tracking"}
          {status === "paused" && `Paused · ${pauseMinutes}m break`}
        </span>
      </CircularTimer>

      <div className="flex gap-3 w-full max-w-[280px]">
        {status === "idle" && (
          <Button
            onClick={() => { setPulse(false); start(); }}
            className={`flex-1 bg-primary text-primary-foreground hover:bg-primary/90 ${BTN} ${pulse ? "animate-cta-pulse" : ""}`}
          >
            Start
          </Button>
        )}
        {status === "running" && (
          <>
            <Button
              onClick={pause}
              variant="outline"
              className={`flex-1 text-foreground ${BTN}`}
              style={{
                background: "hsl(var(--card) / 0.85)",
                border: "1px solid hsl(var(--border))",
              }}
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
            <Button
              onClick={handleStop}
              disabled={stopping}
              className={`flex-1 bg-primary text-primary-foreground hover:bg-primary/90 ${BTN}`}
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </>
        )}
        {status === "paused" && (
          <>
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
              disabled={stopping}
              className={`flex-1 border-border bg-transparent text-foreground ${BTN}`}
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default StopwatchMode;
