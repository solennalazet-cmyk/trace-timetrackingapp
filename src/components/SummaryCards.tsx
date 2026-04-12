import { Timer, CircleDot, ChevronRight } from "lucide-react";
import { formatDuration } from "@/hooks/useTimer";

interface SummaryCardsProps {
  todayCount: number;
  todayMinutes: number;
  unassignedCount: number;
  onTodayClick: () => void;
  onUnassignedClick: () => void;
}

const cardStyle: React.CSSProperties = {
  background: "hsl(var(--card) / 0.85)",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
  padding: "12px 16px",
};

const SummaryCards = ({
  todayCount,
  todayMinutes,
  unassignedCount,
  onTodayClick,
  onUnassignedClick,
}: SummaryCardsProps) => {
  if (todayCount === 0 && unassignedCount === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-6 w-full">
      {todayCount > 0 && (
        <button
          onClick={onTodayClick}
          className="flex items-center justify-between w-full text-left"
          style={cardStyle}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Timer className="w-4 h-4" />
            <span className="text-xs font-medium">
              {todayCount} {todayCount === 1 ? "entry" : "entries"} today · {formatDuration(todayMinutes)}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {unassignedCount > 0 && (
        <button
          onClick={onUnassignedClick}
          className="flex items-center justify-between w-full text-left"
          style={cardStyle}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <CircleDot className="w-4 h-4" />
            <span className="text-xs font-medium">
              {unassignedCount} unassigned
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
};

export default SummaryCards;
