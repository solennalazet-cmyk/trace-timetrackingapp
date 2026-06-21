import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWeekStart } from "@/contexts/WeekStartContext";
import { getClientColor, toLocalDateKey } from "@/lib/utils";

interface ScheduledWorker {
  id: string;
  name: string;
  start: string; // HH:MM
  end: string;   // HH:MM
  engagementStart: string | null;
  engagementEnd: string | null;
  scheduledDays: number[];
}

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19; // 7pm
const HOURS = DAY_END_HOUR - DAY_START_HOUR; // 12

const parseHm = (t: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return null;
  return h + (Number.isNaN(m) ? 0 : m / 60);
};

const fmtHour = (h: number) => {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${h < 12 ? "a" : "p"}`;
};

const WorkersWeekSchedule = () => {
  const { user } = useAuth();
  const weekStart = useWeekStart();
  const [workers, setWorkers] = useState<ScheduledWorker[]>([]);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("id, name, agreed_start_time, agreed_end_time, engagement_start_date, engagement_end_date, scheduled_days")
      .eq("user_id", user.id)
      .in("kind", ["contractor", "both"])
      .eq("connection_status", "accepted");
    const rows = (data ?? [])
      .filter((r: any) => r.agreed_start_time && r.agreed_end_time)
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        start: r.agreed_start_time,
        end: r.agreed_end_time,
        engagementStart: r.engagement_start_date,
        engagementEnd: r.engagement_end_date,
        scheduledDays: r.scheduled_days ?? [0, 1, 2, 3, 4, 5, 6],
      }));
    setWorkers(rows);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const weekDays = useMemo(() => {
    const start = new Date(cursor);
    const offset = (start.getDay() - weekStart + 7) % 7;
    start.setDate(start.getDate() - offset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }, [cursor, weekStart]);

  const weekLabel = useMemo(() => {
    const a = weekDays[0], b = weekDays[6];
    const sameMonth = a.getMonth() === b.getMonth();
    const fmt = (d: Date, withMonth: boolean) =>
      d.toLocaleDateString("en-GB", { day: "numeric", ...(withMonth ? { month: "short" } : {}) });
    return `${fmt(a, !sameMonth)} – ${fmt(b, true)}`;
  }, [weekDays]);

  const todayKey = toLocalDateKey(new Date());

  // For each day, list of workers scheduled (engagement window covers the day)
  const workersByDay = useMemo(() => {
    return weekDays.map((d) => {
      const key = toLocalDateKey(d);
      const dayIndex = d.getDay();
      return workers.filter((w) => {
        if (!w.scheduledDays.includes(dayIndex)) return false;
        return true;
      });
    });
  }, [weekDays, workers]);

  const hasAny = workersByDay.some((d) => d.length > 0);

  const goWeek = (delta: number) => {
    setCursor((c) => { const n = new Date(c); n.setDate(c.getDate() + delta * 7); return n; });
  };

  const hourMarks = Array.from({ length: HOURS + 1 }, (_, i) => DAY_START_HOUR + i);

  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold tracking-tight">Weekly schedule</p>
          <p className="text-[11px] text-muted-foreground">{weekLabel} · 7am–7pm</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => goWeek(-1)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setCursor(d); }}
            className="text-[11px] font-medium px-2 py-1 rounded-md hover:bg-muted"
          >
            Today
          </button>
          <button onClick={() => goWeek(1)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center" aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!hasAny ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          No scheduled freelancers this week. Set agreed times on a freelancer's profile to see them here.
        </p>
      ) : (
        <>
          {/* Hour axis */}
          <div className="relative ml-10 mb-1 h-3">
            {hourMarks.map((h, i) => (
              <span
                key={h}
                className="absolute -translate-x-1/2 text-[9px] text-muted-foreground tabular-nums"
                style={{ left: `${(i / HOURS) * 100}%` }}
              >
                {fmtHour(h)}
              </span>
            ))}
          </div>

          <div className="space-y-1.5">
            {weekDays.map((d, i) => {
              const key = toLocalDateKey(d);
              const isToday = key === todayKey;
              const dayWorkers = workersByDay[i];
              const rowH = Math.max(dayWorkers.length, 1);

              return (
                <div key={key} className="flex items-stretch gap-2">
                  <div className={`w-8 flex flex-col items-center justify-center shrink-0 rounded-md py-1 ${isToday ? "bg-foreground text-background" : ""}`}>
                    <span className="text-[9px] uppercase font-medium leading-none opacity-70">
                      {d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 3)}
                    </span>
                    <span className="text-xs font-semibold leading-tight mt-0.5">{d.getDate()}</span>
                  </div>

                  <div
                    className="relative flex-1 rounded-md bg-muted/40 overflow-hidden"
                    style={{ minHeight: `${rowH * 14 + 6}px` }}
                  >
                    {/* grid lines */}
                    {hourMarks.slice(1, -1).map((_, idx) => (
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 w-px bg-foreground/5"
                        style={{ left: `${((idx + 1) / HOURS) * 100}%` }}
                      />
                    ))}

                    {dayWorkers.map((w, wi) => {
                      const s = parseHm(w.start);
                      const e = parseHm(w.end);
                      if (s === null || e === null || e <= s) return null;
                      const left = Math.max(0, ((s - DAY_START_HOUR) / HOURS) * 100);
                      const right = Math.min(100, ((e - DAY_START_HOUR) / HOURS) * 100);
                      const width = Math.max(2, right - left);
                      const color = getClientColor(w.id);
                      return (
                        <div
                          key={w.id}
                          className="absolute flex items-center px-1.5 rounded-[3px] text-[9px] font-semibold text-white truncate"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: `${3 + wi * 14}px`,
                            height: "11px",
                            backgroundColor: color,
                          }}
                          title={`${w.name} · ${w.start.slice(0,5)}–${w.end.slice(0,5)}`}
                        >
                          <span className="truncate leading-none">{w.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-border/50">
            {workers.map((w) => (
              <div key={w.id} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getClientColor(w.id) }} />
                <span className="text-[10px] text-muted-foreground">{w.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

export default WorkersWeekSchedule;
