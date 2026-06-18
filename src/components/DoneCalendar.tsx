import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";
import { format, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useWeekStart } from "@/contexts/WeekStartContext";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousClients, getAnonymousEntries, getAnonymousProjects, getAnonymousTasks } from "@/lib/anonymous-store";
import { toLocalDateKey, getClientColor, cn } from "@/lib/utils";

interface Entry {
  id: string;
  duration_minutes: number;
  entry_date: string;
  client_id: string | null;
  project_id: string | null;
  task_id: string | null;
  billable: boolean | null;
  rate_amount: number | null;
  rate_unit: string | null;
  rate_currency: string | null;
  client_name?: string;
  project_name?: string;
  task_name?: string;
}

interface TaskGroup {
  key: string;
  taskName: string;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  totalMinutes: number;
  sessionCount: number;
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

const weekdayShort = (idx: number, weekStartsOn: number) => {
  const names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return names[(weekStartsOn + idx) % 7];
};

const DoneCalendar = () => {
  const { user } = useAuth();
  const weekStartsOn = useWeekStart();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // Range covers visible weeks (full grid)
  const gridStart = useMemo(() => startOfWeek(startOfMonth(cursor), { weekStartsOn }), [cursor, weekStartsOn]);
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(cursor), { weekStartsOn }), [cursor, weekStartsOn]);

  const fromKey = toLocalDateKey(gridStart);
  const toKey = toLocalDateKey(gridEnd);

  const load = useCallback(async () => {
    setLoading(true);
    if (user) {
      const [{ data }, { data: clientRows }, { data: projectRows }, { data: taskRows }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("id, duration_minutes, entry_date, client_id, project_id, task_id, billable, rate_amount, rate_unit, rate_currency")
          .eq("user_id", user.id)
          .gte("entry_date", fromKey)
          .lte("entry_date", toKey)
          .is("deleted_at", null),
        supabase.from("clients").select("id, name").eq("user_id", user.id),
        supabase.from("projects").select("id, name").eq("user_id", user.id),
        supabase.from("tasks").select("id, name").eq("user_id", user.id),
      ]);
      const clientMap: Record<string, string> = {};
      clientRows?.forEach((c) => { clientMap[c.id] = c.name; });
      const projectMap: Record<string, string> = {};
      projectRows?.forEach((p) => { projectMap[p.id] = p.name; });
      const taskMap: Record<string, string> = {};
      taskRows?.forEach((t) => { taskMap[t.id] = t.name; });
      setEntries(
        (data ?? []).map((e: any) => ({
          ...e,
          client_name: e.client_id ? clientMap[e.client_id] : undefined,
          project_name: e.project_id ? projectMap[e.project_id] : undefined,
          task_name: e.task_id ? taskMap[e.task_id] : undefined,
        }))
      );
    } else {
      const all = getAnonymousEntries();
      const clientMap: Record<string, string> = {};
      getAnonymousClients().forEach((c: any) => { clientMap[c.id] = c.name; });
      const projectMap: Record<string, string> = {};
      getAnonymousProjects().forEach((p: any) => { projectMap[p.id] = p.name; });
      const taskMap: Record<string, string> = {};
      getAnonymousTasks().forEach((t: any) => { taskMap[t.id] = t.name; });
      setEntries(all
        .filter((e: any) => e.entry_date >= fromKey && e.entry_date <= toKey)
        .map((e: any) => ({
          ...e,
          client_name: e.client_id ? clientMap[e.client_id] : undefined,
          project_name: e.project_id ? projectMap[e.project_id] : undefined,
          task_name: e.task_id ? taskMap[e.task_id] : undefined,
        }))
      );
    }
    setLoading(false);
  }, [user, fromKey, toKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("trace-entries-changed", refresh);
    return () => window.removeEventListener("trace-entries-changed", refresh);
  }, [load]);

  // Build per-day map of client ids present
  const dayMeta = useMemo(() => {
    const m = new Map<string, { clientIds: string[]; totalMinutes: number }>();
    entries.forEach((e) => {
      if (!e.entry_date) return;
      const cur = m.get(e.entry_date) ?? { clientIds: [], totalMinutes: 0 };
      const cid = e.client_id ?? "__unassigned__";
      if (!cur.clientIds.includes(cid)) cur.clientIds.push(cid);
      cur.totalMinutes += e.duration_minutes ?? 0;
      m.set(e.entry_date, cur);
    });
    return m;
  }, [entries]);

  // Build calendar grid
  const days = useMemo(() => {
    const arr: Date[] = [];
    let d = new Date(gridStart);
    while (d <= gridEnd) {
      arr.push(new Date(d));
      d = addDays(d, 1);
    }
    return arr;
  }, [gridStart, gridEnd]);

  // Selected day's task groups
  const selectedKey = toLocalDateKey(selected);
  const selectedTasks = useMemo((): TaskGroup[] => {
    const dayEntries = entries.filter((e) => e.entry_date === selectedKey);
    const groups = new Map<string, TaskGroup>();
    dayEntries.forEach((e) => {
      const key = e.task_id ?? e.project_id ?? e.client_id ?? "__none__";
      const label = e.task_name ?? e.project_name ?? e.client_name ?? "Unassigned";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          taskName: label,
          projectName: e.task_name ? (e.project_name ?? null) : null,
          clientId: e.client_id ?? null,
          clientName: e.client_name ?? null,
          totalMinutes: 0,
          sessionCount: 0,
        });
      }
      const g = groups.get(key)!;
      g.totalMinutes += e.duration_minutes ?? 0;
      g.sessionCount += 1;
    });
    return [...groups.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [entries, selectedKey]);

  const selectedTotalMins = selectedTasks.reduce((s, g) => s + g.totalMinutes, 0);
  const selectedBillable = entries
    .filter((e) => e.entry_date === selectedKey && e.billable && e.rate_amount)
    .reduce((s, e) => {
      const hrs = (e.duration_minutes ?? 0) / 60;
      const rate = e.rate_amount ?? 0;
      return s + (e.rate_unit === "hour" ? hrs * rate : rate);
    }, 0);
  const currency = entries.find((e) => e.entry_date === selectedKey && e.rate_currency)?.rate_currency ?? "EUR";
  const sym = CURRENCY_SYMBOLS[currency] ?? "€";

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous month"
            className="p-1.5 rounded-full hover:bg-muted/40 text-foreground"
            onClick={() => setCursor((c) => addMonths(c, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold tracking-tight">{format(cursor, "MMMM yyyy")}</h2>
          <button
            aria-label="Next month"
            className="p-1.5 rounded-full hover:bg-muted/40 text-foreground"
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => {
            const now = new Date();
            setCursor(startOfMonth(now));
            setSelected(now);
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-full bg-card border border-border text-foreground hover:bg-muted/40"
        >
          Today
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-[10px] font-medium text-muted-foreground tracking-wider">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="text-center py-1">{weekdayShort(i, weekStartsOn)}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d) => {
          const key = toLocalDateKey(d);
          const meta = dayMeta.get(key);
          const inMonth = isSameMonth(d, cursor);
          const isSelected = isSameDay(d, selected);
          const today = isToday(d);
          const dots = meta?.clientIds.slice(0, 3) ?? [];
          return (
            <button
              key={key}
              onClick={() => setSelected(d)}
              className="flex flex-col items-center justify-start pt-1.5 pb-1 min-h-[44px] focus:outline-none"
            >
              <span
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold"
                    : today
                      ? "text-nav-bg font-bold ring-2 ring-nav-bg/30 rounded-full"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/40"
                )}
              >
                {d.getDate()}
              </span>
              {dots.length > 0 && (
                <div className="flex items-center gap-0.5 mt-0.5 h-1.5">
                  {dots.map((cid) => (
                    <span
                      key={cid}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: cid === "__unassigned__" ? "hsl(240 5% 70%)" : getClientColor(cid),
                      }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day panel */}
      <div className="rounded-2xl bg-card border border-border shadow-sm p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{format(selected, "EEEE, d MMMM")}</h3>
            {selectedTotalMins > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatHHMM(selectedTotalMins)} tracked
                {selectedBillable > 0 && <> · {sym}{selectedBillable.toFixed(2)} billable</>}
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
        ) : selectedTasks.length === 0 ? (
          <div className="rounded-xl bg-muted/30 border border-dashed border-border/60 px-4 py-8 text-center">
            <CheckSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-foreground/80 font-medium">No tasks tracked this day</p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Tasks can also be given to a session<br />from the assignment box.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {selectedTasks.map((g) => (
              <li key={g.key} className="flex items-center gap-3 py-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: g.clientId ? getClientColor(g.clientId) : "hsl(240 5% 70%)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{g.taskName}</p>
                  {(g.projectName || g.clientName) && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[g.projectName, g.clientName].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm font-semibold text-foreground">{formatHHMM(g.totalMinutes)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {g.sessionCount} session{g.sessionCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DoneCalendar;
