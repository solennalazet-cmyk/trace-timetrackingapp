import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Coins, AlertTriangle, Clock3, Coffee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getClientColor, toLocalDateKey } from "@/lib/utils";
import DateRangePicker from "@/components/DateRangePicker";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

/** Billing cutoffs run on the 1st and 15th of each month. */
const nextBillingCutoff = (from: Date) => {
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const day = d.getDate();
  const result = new Date(d);
  if (day < 15) result.setDate(15);
  else { result.setMonth(d.getMonth() + 1, 1); }
  return result;
};

interface ReportRow {
  id: string;
  client_id: string;
  worker_user_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  entries_snapshot: any;
}

interface Props {
  refreshKey?: number;
}

const HEALTHY_MIN = 25;
const HEALTHY_MAX = 40;
const Y_MAX = 60;

const EmployerDashboardSection = ({ refreshKey }: Props) => {
  const { user } = useAuth();
  const [from, setFrom] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; });
  const [to, setTo] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [paidByReport, setPaidByReport] = useState<Map<string, number>>(new Map());
  const [workerNames, setWorkerNames] = useState<Map<string, string>>(new Map());
  const [selectedWorker, setSelectedWorker] = useState<string | "all">("all");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const fromKey = toLocalDateKey(from);
      const toKey = toLocalDateKey(to);
      const { data: rRows } = await supabase
        .from("submitted_reports")
        .select("id, client_id, worker_user_id, period_start, period_end, total_amount, currency, status, submitted_at, reviewed_at, entries_snapshot")
        .eq("employer_user_id", user.id)
        .gte("period_end", fromKey)
        .lte("period_start", toKey);
      if (cancelled) return;
      const rows = (rRows ?? []) as any as ReportRow[];
      setReports(rows);

      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: pRows } = await supabase
          .from("report_payments")
          .select("submitted_report_id, amount")
          .in("submitted_report_id", ids);
        const m = new Map<string, number>();
        for (const p of (pRows ?? []) as any[]) {
          m.set(p.submitted_report_id, (m.get(p.submitted_report_id) ?? 0) + Number(p.amount));
        }
        if (!cancelled) setPaidByReport(m);
      } else {
        setPaidByReport(new Map());
      }

      const clientIds = Array.from(new Set(rows.map((r) => r.client_id))).filter(Boolean);
      if (clientIds.length > 0) {
        const { data: cRows } = await supabase.from("clients").select("id, name").in("id", clientIds);
        if (!cancelled) setWorkerNames(new Map((cRows ?? []).map((c: any) => [c.id, c.name])));
      }
    })();
    return () => { cancelled = true; };
  }, [user, from, to, refreshKey]);

  const workers = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const r of reports) {
      if (!m.has(r.client_id)) m.set(r.client_id, { id: r.client_id, name: workerNames.get(r.client_id) ?? "Worker" });
    }
    return Array.from(m.values());
  }, [reports, workerNames]);

  const filteredReports = useMemo(
    () => selectedWorker === "all" ? reports : reports.filter((r) => r.client_id === selectedWorker),
    [reports, selectedWorker],
  );

  const totals = useMemo(() => {
    let total = 0, paid = 0, pending = 0, overdue = 0;
    let currency = "EUR";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of filteredReports) {
      currency = r.currency;
      const amt = Number(r.total_amount);
      if (r.status === "rejected") continue;
      total += amt;
      const p = Math.min(amt, paidByReport.get(r.id) ?? 0);
      paid += p;
      const remaining = Math.max(0, amt - p);
      if (remaining <= 0.005) continue;
      if (r.status === "approved") {
        const ref = new Date(r.reviewed_at ?? r.submitted_at);
        const dueDate = nextBillingCutoff(ref);
        if (dueDate < today) overdue += remaining;
        else pending += remaining;
      } else {
        pending += remaining;
      }
    }
    return { total, paid, pending, overdue, currency };
  }, [filteredReports, paidByReport]);

  // Build per-day break minutes from entries_snapshot, restricted to selected range.
  const breakSeries = useMemo(() => {
    const fromKey = toLocalDateKey(from);
    const toKey = toLocalDateKey(to);
    const dayMs = 86400000;
    const days: string[] = [];
    for (let t = new Date(from).getTime(); t <= to.getTime(); t += dayMs) {
      days.push(toLocalDateKey(new Date(t)));
    }
    // sum break minutes and count entries per day
    const sum = new Map<string, number>();
    const has = new Map<string, boolean>();
    for (const r of filteredReports) {
      const snap = Array.isArray(r.entries_snapshot) ? r.entries_snapshot : [];
      for (const e of snap) {
        const date = e.entry_date as string | undefined;
        if (!date || date < fromKey || date > toKey) continue;
        has.set(date, true);
        sum.set(date, (sum.get(date) ?? 0) + (Number(e.break_minutes) || 0));
      }
    }
    return days.map((d) => ({
      date: d,
      minutes: sum.get(d) ?? 0,
      worked: has.get(d) ?? false,
    }));
  }, [filteredReports, from, to]);

  const sym = CURRENCY_SYMBOLS[totals.currency] ?? "€";
  const fmt = (n: number) => `${sym}${n.toFixed(2)}`;

  // Compress series for display: if >14 days, show only last 14 to keep bars legible
  const visibleSeries = breakSeries.length > 14 ? breakSeries.slice(-14) : breakSeries;

  return (
    <section className="space-y-3">
      {/* Range + worker pills */}
      <div className="space-y-2">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedWorker("all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${selectedWorker === "all" ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border"}`}
          >
            All workers
          </button>
          {workers.map((w) => {
            const color = getClientColor(w.id);
            const active = selectedWorker === w.id;
            return (
              <button
                key={w.id}
                onClick={() => setSelectedWorker(w.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5 ${active ? "border-foreground" : "border-border"}`}
                style={active ? { backgroundColor: color, color: "#fff", borderColor: color } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {w.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Wages dashboard — Card dashboard (v2) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total wages</p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-0.5">{fmt(totals.total)}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">{filteredReports.length} report{filteredReports.length === 1 ? "" : "s"}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-emerald-500/10 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1"><Coins className="w-3 h-3" /> Paid</p>
            <p className="text-sm font-mono font-bold mt-1">{fmt(totals.paid)}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${totals.pending > 0 ? "bg-amber-500/10" : "bg-muted"}`}>
            <p className={`text-[10px] uppercase tracking-wide font-semibold flex items-center gap-1 ${totals.pending > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}><Clock3 className="w-3 h-3" /> Pending</p>
            <p className="text-sm font-mono font-bold mt-1">{fmt(totals.pending)}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${totals.overdue > 0 ? "bg-red-500/10" : "bg-muted"}`}>
            <p className={`text-[10px] uppercase tracking-wide font-semibold flex items-center gap-1 ${totals.overdue > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}><AlertTriangle className="w-3 h-3" /> Overdue</p>
            <p className="text-sm font-mono font-bold mt-1">{fmt(totals.overdue)}</p>
          </div>
        </div>
      </Card>

      {/* Break pattern */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coffee className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Break pattern</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">1 bar = 1 day · minutes of break</p>
        </div>

        {visibleSeries.every((d) => !d.worked) ? (
          <p className="text-xs text-muted-foreground text-center py-4">No break data in this range.</p>
        ) : (
          <>
            <div className="relative h-32 pl-7 pr-1">
              {/* Y axis ticks */}
              <div className="absolute left-0 top-0 h-full w-7 flex flex-col justify-between text-[9px] text-muted-foreground">
                <span>60m</span>
                <span>45m</span>
                <span>30m</span>
                <span>15m</span>
                <span>0m</span>
              </div>
              {/* Healthy band (25–40m) */}
              <div
                className="absolute left-7 right-1 bg-emerald-500/10 border-y border-dashed border-emerald-500/30 pointer-events-none"
                style={{
                  bottom: `${(HEALTHY_MIN / Y_MAX) * 100}%`,
                  height: `${((HEALTHY_MAX - HEALTHY_MIN) / Y_MAX) * 100}%`,
                }}
              />
              {/* Bars */}
              <div className="relative h-full flex items-end justify-between gap-1">
                {visibleSeries.map((d) => {
                  const h = Math.min(100, (d.minutes / Y_MAX) * 100);
                  const zone = !d.worked
                    ? "bg-muted"
                    : d.minutes === 0
                      ? "bg-red-400"
                      : d.minutes < HEALTHY_MIN
                        ? "bg-amber-400"
                        : d.minutes <= HEALTHY_MAX
                          ? "bg-emerald-500"
                          : "bg-red-400";
                  return (
                    <div key={d.date} className="flex-1 h-full flex flex-col items-center justify-end gap-1 group relative">
                      {d.worked && (
                        <span className="absolute -top-4 text-[9px] font-mono font-semibold text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {d.minutes}m
                        </span>
                      )}
                      <div
                        className={`w-full max-w-[14px] rounded-t-sm ${zone}`}
                        style={{ height: d.worked ? `${Math.max(h, 4)}%` : "4%", opacity: d.worked ? 1 : 0.4 }}
                        title={`${d.date}: ${d.worked ? `${d.minutes}m break` : "no work"}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Day labels */}
            <div className="flex justify-between gap-1 pl-7 pr-1 text-[9px] text-muted-foreground">
              {visibleSeries.map((d) => {
                const day = new Date(d.date + "T00:00:00").getDate();
                return <span key={d.date} className="flex-1 text-center">{day}</span>;
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground pt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Healthy 25–40m</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Short</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> None / long</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted-foreground/40" /> Off day</span>
            </div>
            {breakSeries.length > 14 && (
              <p className="text-[10px] text-muted-foreground">Showing last 14 days of selected range.</p>
            )}
          </>
        )}
      </Card>
    </section>
  );
};

export default EmployerDashboardSection;
