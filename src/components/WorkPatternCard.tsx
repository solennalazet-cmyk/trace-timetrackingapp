import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Coffee, ChevronDown, PencilLine, X } from "lucide-react";
import { getClientColor, toLocalDateKey } from "@/lib/utils";
import { useWeekStart } from "@/contexts/WeekStartContext";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

export interface WorkPatternReport {
  worker_user_id: string;
  currency: string;
  status?: string;
  entries_snapshot: any;
}

interface Props {
  reports: WorkPatternReport[];
  workerNames: Map<string, string>;
  from: Date;
  to: Date;
  selectedWorker: string | "all";
  onSelectWorker: (id: string | "all") => void;
  defaultOpen?: boolean;
}

interface FlatEntry {
  workerId: string;
  date: string;
  startMin: number | null;
  endMin: number | null;
  work: number;
  brk: number;
  value: number;
  manual: boolean;
  approved: boolean;
}

const fmtHm = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
};

const fmtClock = (minsOfDay: number | null) => {
  if (minsOfDay === null || !Number.isFinite(minsOfDay)) return "—";
  const m = ((Math.round(minsOfDay) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const minutesOfDay = (iso?: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
};

const WorkPatternCard = ({ reports, workerNames, from, to, selectedWorker, onSelectWorker, defaultOpen = false }: Props) => {
  const weekStart = useWeekStart();
  const [open, setOpen] = useState(defaultOpen);
  // Week indices the user tapped to narrow the stats. Empty = whole range.
  const [weekSelection, setWeekSelection] = useState<number[]>([]);

  const currency = reports[0]?.currency ?? "EUR";
  const sym = CURRENCY_SYMBOLS[currency] ?? "€";

  // ── Flatten report snapshots into deduped entries inside the range ──
  const entries = useMemo<FlatEntry[]>(() => {
    const fromKey = toLocalDateKey(from);
    const toKey = toLocalDateKey(to);
    const seen = new Set<string>();
    const out: FlatEntry[] = [];
    for (const r of reports) {
      if (!r.worker_user_id) continue;
      if (selectedWorker !== "all" && r.worker_user_id !== selectedWorker) continue;
      const snap = Array.isArray(r.entries_snapshot) ? r.entries_snapshot : [];
      for (const e of snap) {
        const date = e.entry_date as string | undefined;
        if (!date || date < fromKey || date > toKey) continue;
        const key = String(e.id ?? `${r.worker_user_id}|${date}|${e.start_time ?? ""}|${e.end_time ?? ""}`);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          workerId: r.worker_user_id,
          date,
          startMin: minutesOfDay(e.start_time),
          endMin: minutesOfDay(e.end_time),
          work: Number(e.duration_minutes) || 0,
          brk: Number(e.break_minutes) || 0,
          value: Number(e.billable_value) || 0,
          manual: e.entry_type === "manual",
          approved: r.status === "approved",
        });
      }
    }
    return out;
  }, [reports, selectedWorker, from, to]);

  // ── Week buckets covering the range ──
  const weeks = useMemo(() => {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() - weekStart + 7) % 7));
    const buckets: { start: Date; end: Date; startKey: string; endKey: string }[] = [];
    for (let d = new Date(start); d <= to; d.setDate(d.getDate() + 7)) {
      const s = new Date(d);
      const e = new Date(d);
      e.setDate(e.getDate() + 6);
      buckets.push({ start: s, end: e, startKey: toLocalDateKey(s), endKey: toLocalDateKey(e) });
    }
    return buckets;
  }, [from, to, weekStart]);

  // Per-week: average hours per worked day
  const weekStats = useMemo(() => {
    return weeks.map((w) => {
      const inWeek = entries.filter((e) => e.date >= w.startKey && e.date <= w.endKey);
      const days = new Set(inWeek.map((e) => e.date));
      const work = inWeek.reduce((s, e) => s + e.work, 0);
      return {
        ...w,
        totalWork: work,
        workedDays: days.size,
        avgPerDay: days.size > 0 ? work / days.size : 0,
      };
    });
  }, [weeks, entries]);

  const toggleWeek = (i: number) => {
    setWeekSelection((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)));
  };

  // Entries scoped to the tapped weeks (or all weeks when none tapped)
  const scoped = useMemo(() => {
    if (weekSelection.length === 0) return entries;
    const ranges = weekSelection.map((i) => weekStats[i]).filter(Boolean);
    return entries.filter((e) => ranges.some((r) => e.date >= r.startKey && e.date <= r.endKey));
  }, [entries, weekSelection, weekStats]);

  const stats = useMemo(() => {
    const byDay = new Map<string, { start: number | null; end: number | null; work: number; value: number }>();
    for (const e of scoped) {
      const prev = byDay.get(e.date) ?? { start: null, end: null, work: 0, value: 0 };
      if (e.startMin !== null) prev.start = prev.start === null ? e.startMin : Math.min(prev.start, e.startMin);
      if (e.endMin !== null) prev.end = prev.end === null ? e.endMin : Math.max(prev.end, e.endMin);
      prev.work += e.work;
      prev.value += e.value;
      byDay.set(e.date, prev);
    }
    const days = Array.from(byDay.values());
    const starts = days.map((d) => d.start).filter((x): x is number => x !== null);
    const ends = days.map((d) => d.end).filter((x): x is number => x !== null);
    const totalWork = days.reduce((s, d) => s + d.work, 0);
    const totalValue = days.reduce((s, d) => s + d.value, 0);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
    return {
      avgStart: avg(starts),
      avgFinish: avg(ends),
      avgDay: days.length ? totalWork / days.length : 0,
      workedDays: days.length,
      totalWork,
      totalValue,
      avgValue: days.length ? totalValue / days.length : 0,
      manualCount: scoped.filter((e) => e.manual).length,
      sessionCount: scoped.length,
      pendingCount: scoped.filter((e) => !e.approved).length,
      allApproved: scoped.length > 0 && scoped.every((e) => e.approved),
    };
  }, [scoped]);

  const legend = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.workerId, (m.get(e.workerId) ?? 0) + e.work);
    return Array.from(m.entries())
      .map(([id, mins]) => ({ id, name: workerNames.get(id) ?? "Freelancer", mins }))
      .sort((a, b) => b.mins - a.mins);
  }, [entries, workerNames]);

  const maxAvg = Math.max(1, ...weekStats.map((w) => w.avgPerDay));
  const accent = selectedWorker !== "all" ? getClientColor(selectedWorker) : undefined;

  const scopeLabel = weekSelection.length === 0
    ? "Full range"
    : weekSelection.length === 1
      ? `Week of ${weekStats[weekSelection[0]]?.start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
      : `${weekSelection.length} weeks selected`;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Coffee className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-base font-bold tracking-tight">Work pattern</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {selectedWorker === "all" ? "All freelancers" : workerNames.get(selectedWorker) ?? "Freelancer"} · weekly average
          </p>
        </div>
        <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-5 space-y-6">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No freelancer data in this range.</p>
          ) : (
            <>
              {/* ── Weekly bars: average hours per worked day ── */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avg hours / worked day</p>
                  {weekSelection.length > 0 && (
                    <button
                      onClick={() => setWeekSelection([])}
                      className="text-[11px] font-semibold text-primary flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>

                <div className="flex items-end justify-between gap-2 h-40">
                  {weekStats.map((w, i) => {
                    const active = weekSelection.includes(i);
                    const dim = weekSelection.length > 0 && !active;
                    const pct = w.avgPerDay > 0 ? Math.max(8, (w.avgPerDay / maxAvg) * 100) : 4;
                    return (
                      <button
                        key={w.startKey}
                        onClick={() => toggleWeek(i)}
                        className="flex-1 h-full flex flex-col items-center justify-end gap-2 min-w-0"
                        aria-pressed={active}
                        aria-label={`Week of ${w.startKey}, ${fmtHm(w.avgPerDay)} per day`}
                      >
                        <span className={`text-[11px] font-bold tabular-nums ${dim ? "text-muted-foreground/50" : "text-foreground"}`}>
                          {w.avgPerDay > 0 ? fmtHm(w.avgPerDay) : "—"}
                        </span>
                        <div
                          className={`w-full rounded-t-lg transition-all ${w.avgPerDay > 0 ? (accent ? "" : "bg-primary") : "bg-muted"} ${dim ? "opacity-30" : ""} ${active ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`}
                          style={{ height: `${pct}%`, backgroundColor: w.avgPerDay > 0 && accent ? accent : undefined }}
                        />
                        <span className={`text-[11px] font-semibold ${dim ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                          {w.start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Tap week columns to narrow the stats below · {scopeLabel}
                </p>
              </div>

              {/* ── Stats ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted rounded-2xl p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Avg start</p>
                  <p className="text-lg font-bold tabular-nums">{fmtClock(stats.avgStart)}</p>
                </div>
                <div className="bg-muted rounded-2xl p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Avg finish</p>
                  <p className="text-lg font-bold tabular-nums">{fmtClock(stats.avgFinish)}</p>
                </div>
                <div className="bg-muted rounded-2xl p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Day length</p>
                  <p className="text-lg font-bold tabular-nums">{fmtHm(stats.avgDay)}</p>
                </div>
                <div className="bg-muted rounded-2xl p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Days worked</p>
                  <p className="text-lg font-bold tabular-nums">{stats.workedDays}</p>
                </div>
                <div className="bg-muted rounded-2xl p-3.5 col-span-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Avg paid / worked day</p>
                    <p className="text-lg font-bold tabular-nums">{sym}{stats.avgValue.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Total</p>
                    <p className="text-lg font-bold tabular-nums">{sym}{stats.totalValue.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* ── Manual entry note ── */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <PencilLine className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">
                  {stats.manualCount === 0
                    ? `All ${stats.sessionCount} sessions tracked live`
                    : `${stats.manualCount} of ${stats.sessionCount} sessions entered manually`}
                </span>
              </div>

              {/* ── Legend ── */}
              {legend.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 border-t border-border pt-4">
                  {legend.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => onSelectWorker(selectedWorker === l.id ? "all" : l.id)}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getClientColor(l.id) }} />
                      <span className="font-medium truncate max-w-[120px]">{l.name}</span>
                      <span className="text-muted-foreground tabular-nums">{fmtHm(l.mins)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
};

export default WorkPatternCard;
