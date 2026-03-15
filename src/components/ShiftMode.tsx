import { useTimer } from "@/hooks/useTimer";
import CircularTimer from "./CircularTimer";
import { Button } from "@/components/ui/button";
import { Pause, Play, LogOut } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInHours } from "date-fns";

interface ShiftModeProps {
  onClockOut: (data: { durationMinutes: number; breakMinutes: number; startedAt: string | null }) => void;
}

const ShiftMode = ({ onClockOut }: ShiftModeProps) => {
  const { status, elapsedMs, startedAt, totalPausedMs, start, pause, resume, stop } = useTimer("shift");

  const handleClockIn = () => {
    start();
    toast.success("You're clocked in. Have a great work session!");
  };

  const handleClockOut = () => {
    const result = stop();
    onClockOut(result);
  };

  const pauseMinutes = Math.floor(totalPausedMs / 60000);
  const clockInTime = startedAt ? format(new Date(startedAt), "HH:mm") : "";
  const hoursRunning = startedAt ? differenceInHours(new Date(), new Date(startedAt)) : 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <CircularTimer
        filled={status !== "idle"}
        fillColor="hsl(330, 81%, 60%)"
        dimmed={status === "paused"}
        pulsing={false}
      >
        {status === "idle" ? (
          <>
            <span className="font-mono text-3xl font-bold text-timer-display">
              {format(new Date(), "HH:mm")}
            </span>
            <span className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">
              Ready to clock in
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-3xl font-bold" style={{ color: "hsl(0, 0%, 95%)" }}>
              Since {clockInTime}
            </span>
            <span className="text-xs font-medium mt-1 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.8)" }}>
              {status === "paused" ? "Paused" : "Shift in progress"}
            </span>
          </>
        )}
      </CircularTimer>

      {status === "paused" && pauseMinutes > 0 && (
        <p className="text-xs text-muted-foreground">Paused · {pauseMinutes}m break</p>
      )}

      {hoursRunning >= 24 && status !== "idle" && (
        <div className="w-full max-w-[280px] bg-accent rounded-lg p-3 text-center">
          <p className="text-xs text-foreground font-medium">
            Your shift has been running for over 24 hours. Did you forget to clock out?
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={handleClockOut}>
            Clock Out
          </Button>
        </div>
      )}

      <div className="flex gap-3 w-full max-w-[280px]">
        {status === "idle" && (
          <Button
            onClick={handleClockIn}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base font-semibold"
          >
            Clock In
          </Button>
        )}
        {status === "running" && (
          <>
            <Button onClick={pause} variant="outline" className="flex-1 h-12">
              <Pause className="w-4 h-4 mr-2" /> Pause
            </Button>
            <Button onClick={handleClockOut} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-12">
              <LogOut className="w-4 h-4 mr-2" /> Clock Out
            </Button>
          </>
        )}
        {status === "paused" && (
          <>
            <Button onClick={resume} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-12">
              <Play className="w-4 h-4 mr-2" /> Resume
            </Button>
            <Button onClick={handleClockOut} variant="outline" className="flex-1 h-12">
              <LogOut className="w-4 h-4 mr-2" /> Clock Out
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default ShiftMode;
