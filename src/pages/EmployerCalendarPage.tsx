import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Coffee, Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWeekStart } from "@/contexts/WeekStartContext";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getClientColor, toLocalDateKey } from "@/lib/utils";
import Seo from "@/components/Seo";

interface ReportRow {
  id: string;
  client_id: string;
  entries_snapshot: any;
}

interface DayFreelancer {
  clientId: string;
  name: string;
  color: string;
  workMin: number;
  breakMin: number;
  firstStart: string | null;
  lastEnd: string | null;
}

const fmtHm = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
};

const monthLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const fmtDayHeader = (key: string) => {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
};

const EmployerCalendarPage = () => {
  const { user } = useAuth();
  const weekStart = useWeekStart();

  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Visible grid bounds (full weeks containing the month)
  const { gridStart, gridEnd, weeks, monthStartKey, monthEndKey } = useMemo(() => {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const start = new Date(monthStart);
    const offsetStart = (start.getDay() - weekStart + 7) % 7;
    start.setDate(start.getDate() - offsetStart);
    const end = new Date(monthEnd);
    const offsetEnd = (6 - ((end.getDay() - weekStart + 7) % 7));
    end.setDate(end.getDate() + offsetEnd);

    const days: Date[] = [];
    for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) {
      days.push(new Date(t));
    }
    const wks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) wks.push(days.slice(i, i + 7));
    return {
      gridStart: start, gridEnd: end, weeks: wks,
      monthStartKey: toLocalDateKey(monthStart),
      monthEndKey: toLocalDateKey(monthEnd),
    };
  }, [cursor, weekStart]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("submitted_reports")
      .select("id, client_id, entries_snapshot")
      .eq("employer_user_id", user.id)
      .gte("period_end", toLocalDateKey(gridStart))
      .lte("period_start", toLocalDateKey(gridEnd));
    const rows = (data ?? []) as any as ReportRow[];
    setReports(rows);
    const ids = Array.from(new Set(rows.map((r) => r.client_id)));
    if (ids.length) {
      const { data: cRows } = await supabase.from("clients").select("id, name").in("id", ids);
      setNames(new Map((cRows ?? []).map((c: any) => [c.id, c.name as string])));
    } else {
      setNames(new Map());
    }
    setLoading(false);
  }, [user, gridStart, gridEnd]);

  useEffect(() => { load(); }, [load]);

  // Build per-day freelancer breakdown from all reports' entries_snapshot
  const byDay = useMemo(() => {
    const m = new Map<string, Map<string, DayFreelancer>>();
    for (const r of reports) {
      const snap = Array.isArray(r.entries_snapshot) ? r.entries_snapshot : [];
      for (const e of snap) {
        const date = e.entry_date as string | undefined;
        if (!date) continue;
        let dayMap = m.get(date);
        if (!dayMap) { dayMap = new Map(); m.set(date, dayMap); }
        let dc = dayMap.get(r.client_id);
        if (!dc) {
          dc = {
            clientId: r.client_id,
            name: names.get(r.client_id) ?? "Freelancer",
            color: getClientColor(r.client_id),
            workMin: 0, breakMin: 0,
            firstStart: null, lastEnd: null,
          };
          dayMap.set(r.client_id, dc);
        }
        dc.workMin += Number(e.duration_minutes) || 0;
        dc.breakMin += Number(e.break_minutes) || 0;
        const st = e.start_time as string | null | undefined;
        const en = e.end_time as string | null | undefined;
        if (st && (!dc.firstStart || st < dc.firstStart)) dc.firstStart = st;
        if (en && (!dc.lastEnd || en > dc.lastEnd)) dc.lastEnd = en;
      }
    }
    return m;
  }, [reports, names]);

  const todayKey = toLocalDateKey(new Date());
  const weekdayLabels = useMemo(() => {
    const base = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return Array.from({ length: 7 }, (_, i) => base[(weekStart + i) % 7]);
  }, [weekStart]);

  const selectedFreelancers = selectedDay ? Array.from(byDay.get(selectedDay)?.values() ?? []) : [];

  const goMonth = (delta: number) => {
    setCursor((c) => {
      const n = new Date(c); n.setMonth(c.getMonth() + delta); return n;
    });
  };

  return (
    <div className="pt-6 pb-24 space-y-4">
      <Seo title={"Calendar — Trace for Employers"} description={"See which freelancers were on the job each day at a glance."} path={"/employer/calendar"} />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">Tap a day to see who worked, for how long, and how their breaks looked.</p>
      </header>

      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => goMonth(-1)}
            className="h-9 w-9 rounded-xl hover:bg-muted/50 flex items-center justify-center"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCursor(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })}
            className="text-sm font-semibold tracking-tight px-3 py-1.5 rounded-lg hover:bg-muted/50"
          >
            {monthLabel(cursor)}
          </button>
          <button
            onClick={() => goMonth(1)}
            className="h-9 w-9 rounded-xl hover:bg-muted/50 flex items-center justify-center"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekdayLabels.map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-wide text-muted-foreground text-center font-medium py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((d) => {
            const key = toLocalDateKey(d);
            const inMonth = key >= monthStartKey && key <= monthEndKey;
            const isToday = key === todayKey;
            const isSelected = selectedDay === key;
            const dayMap = byDay.get(key);
            const freelancers = dayMap ? Array.from(dayMap.values()) : [];
            const hasData = freelancers.length > 0;

            return (
              <button
                key={key}
                onClick={() => hasData && setSelectedDay(key)}
                disabled={!hasData}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-start pt-1.5 px-1 transition-all
                  ${inMonth ? "" : "opacity-30"}
                  ${isSelected ? "bg-foreground text-background" : isToday ? "bg-foreground/10" : hasData ? "bg-muted/40 hover:bg-muted" : "bg-transparent"}
                  ${hasData ? "cursor-pointer" : "cursor-default"}
                `}
              >
                <span className={`text-xs font-semibold ${isSelected ? "text-background" : "text-foreground"}`}>
                  {d.getDate()}
                </span>
                {hasData && (
                  <div className="flex flex-wrap gap-0.5 justify-center mt-auto mb-1.5 max-w-full">
                    {freelancers.slice(0, 4).map((c) => (
                      <span
                        key={c.clientId}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: isSelected ? "#fff" : c.color }}
                      />
                    ))}
                    {freelancers.length > 4 && (
                      <span className={`text-[8px] leading-none ${isSelected ? "text-background" : "text-muted-foreground"}`}>+{freelancers.length - 4}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {loading && (
          <p className="text-[11px] text-muted-foreground text-center pt-3">Loading…</p>
        )}
      </Card>

      <Sheet open={selectedDay !== null} onOpenChange={(o) => { if (!o) setSelectedDay(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-4 pb-6 max-h-[80vh] overflow-y-auto">
          <SheetHeader className="text-left mb-3">
            <SheetTitle className="text-lg">{selectedDay ? fmtDayHeader(selectedDay) : ""}</SheetTitle>
            <p className="text-xs text-muted-foreground">
              {selectedFreelancers.length} {selectedFreelancers.length === 1 ? "freelancer" : "freelancers"} on the job
            </p>
          </SheetHeader>

          <div className="space-y-2.5">
            {selectedFreelancers
              .sort((a, b) => b.workMin - a.workMin)
              .map((c) => {
                const total = c.workMin + c.breakMin;
                const workPct = total > 0 ? (c.workMin / total) * 100 : 0;
                return (
                  <Card key={c.clientId} className="p-3.5">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <p className="text-sm font-semibold truncate flex-1">{c.name}</p>
                      {c.firstStart && c.lastEnd && (
                        <p className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {c.firstStart.slice(0, 5)} – {c.lastEnd.slice(0, 5)}
                        </p>
                      )}
                    </div>

                    {/* Work vs break bar */}
                    <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                      <div className="h-full" style={{ width: `${workPct}%`, backgroundColor: c.color }} />
                      <div className="h-full bg-foreground/25" style={{ width: `${100 - workPct}%` }} />
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-semibold">{fmtHm(c.workMin)}</span>
                        <span className="text-muted-foreground">worked</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Coffee className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-semibold">{fmtHm(c.breakMin)}</span>
                        <span className="text-muted-foreground">on break</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default EmployerCalendarPage;
