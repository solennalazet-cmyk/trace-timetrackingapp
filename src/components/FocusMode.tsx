import { useFocusTimer } from "@/hooks/useFocusTimer";
import CircularTimer from "./CircularTimer";
import { Button } from "@/components/ui/button";
import { useCallback, useRef } from "react";

interface FocusModeProps {
  onComplete: (data: { durationMinutes: number; breakMinutes: number; startedAt: string | null }) => void;
}

const PRESETS = [
  { label: "25m", minutes: 25 },
  { label: "45m", minutes: 45 },
  { label: "1h", minutes: 60 },
  { label: "1h 30m", minutes: 90 },
];

const FocusMode = ({ onComplete }: FocusModeProps) => {
  const {
    status,
    totalSeconds,
    remainingMs,
    progress,
    setPreset,
    setCustomSeconds,
    start,
    reset,
    restart,
  } = useFocusTimer();

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

  const handleAssign = () => {
    const durationMinutes = Math.round(totalSeconds / 60);
    reset();
    onComplete({ durationMinutes, breakMinutes: 0, startedAt: null });
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div onPointerMove={status === "idle" ? (e) => {
        if (e.buttons === 1) handleDrag(e);
      } : undefined}>
        <CircularTimer
          progress={status === "idle" ? totalSeconds / (120 * 60) : status === "running" ? 1 - progress : 0}
          arcColor="hsl(53, 98%, 77%)"
          pulsing={status === "running"}
        >
          <svg ref={svgRef} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <span className="font-mono text-4xl font-bold text-timer-display">
            {status === "idle"
              ? `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
              : status === "running"
              ? formatCountdown(remainingMs)
              : "Done!"}
          </span>
          <span className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">
            {status === "idle" && "Set duration"}
            {status === "running" && "Focus"}
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
            className="w-full max-w-[280px] bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-14 text-[16px] font-bold"
          >
            Start Focus
          </Button>
        </>
      )}

      {status === "completed" && (
        <div className="flex gap-3 w-full max-w-[280px]">
          <Button onClick={restart} variant="outline" className="flex-1 h-12">
            Restart
          </Button>
          <Button
            onClick={handleAssign}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-12"
          >
            Assign Work
          </Button>
        </div>
      )}
    </div>
  );
};

export default FocusMode;
