import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Coins, AlertTriangle, Clock3, Coffee, ChevronDown } from "lucide-react";
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
  breaksDefaultOpen?: boolean;
}

// Break adequacy bands scaled to the day's worked hours.
// Anchored to Portuguese labour law: a worker doing 6h+ must take a break of
// at least 1h (and not more than 2h) per Art. 213º CT. Shorter days take
// proportionally shorter breaks.
const Y_MAX = 90; // capsule scale cap (m)

type Band = "healthy" | "short" | "long" | "none";

/** Returns the recommended break band for a given day. */
const breakBand = (breakMins: number, workMins: number): Band => {
  if (workMins <= 0) return "none";
  // Under 4h worked: no legal break required, but flag clearly excessive breaks.
  if (workMins < 240) {
    if (breakMins > 30) return "long";
    return "healthy";
  }
  // 4h to <6h: recommend a short pause, ~15–45m.
  if (workMins < 360) {
    if (breakMins < 15) return "short";
    if (breakMins > 45) return "long";
    return "healthy";
  }
  // 6h+: legal min 45m–1h, healthy up to ~75m.
  if (breakMins < 45) return breakMins === 0 ? "none" : "short";
  if (breakMins > 75) return "long";
  return "healthy";
};

const bandClass = (band: Band): string => {
  switch (band) {
    case "healthy": return "bg-emerald-500";
    case "short": return "bg-amber-400";
    case "long": return "bg-amber-400";
    case "none": return "bg-red-400";
  }
};

const bandLabel = (band: Band): string => {
  switch (band) {
    case "healthy": return "Healthy";
    case "short": return "Too short";
    case "long": return "Too long";
    case "none": return "No break";
  }
};


const fmtHm = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
};

const EmployerDashboardSection = ({ refreshKey, breaksDefaultOpen = false }: Props) => {
  const { user } = useAuth();
  const [from, setFrom] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; });
  const [to, setTo] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [paidByReport, setPaidByReport] = useState<Map<string, number>>(new Map());
  const [workerNames, setWorkerNames] = useState<Map<string, string>>(new Map());
  const [selectedWorker, setSelectedWorker] = useState<string | "all">("all");
  const [breaksOpen, setBreaksOpen] = useState(breaksDefaultOpen);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

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
      if (!m.has(r.client_id)) m.set(r.client_id, { id: r.client_id, name: workerNames.get(r.client_id) ?? "Freelancer" });
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

  // Per-worker break + work breakdown by day within range
  const workerBreaks = useMemo(() => {
    const fromKey = toLocalDateKey(from);
    const toKey = toLocalDateKey(to);
    const dayMs = 86400000;
    const allDays: string[] = [];
    for (let t = new Date(from).getTime(); t <= to.getTime(); t += dayMs) {
      allDays.push(toLocalDateKey(new Date(t)));
    }
    const byWorker = new Map<string, { id: string; name: string; perDay: Map<string, { work: number; brk: number }> }>();
    for (const r of reports) {
      if (selectedWorker !== "all" && r.client_id !== selectedWorker) continue;
      let w = byWorker.get(r.client_id);
      if (!w) {
        w = { id: r.client_id, name: workerNames.get(r.client_id) ?? "Freelancer", perDay: new Map() };
        byWorker.set(r.client_id, w);
      }
      const snap = Array.isArray(r.entries_snapshot) ? r.entries_snapshot : [];
      for (const e of snap) {
        const date = e.entry_date as string | undefined;
        if (!date || date < fromKey || date > toKey) continue;
        const prev = w.perDay.get(date) ?? { work: 0, brk: 0 };
        prev.work += Number(e.duration_minutes) || 0;
        prev.brk += Number(e.break_minutes) || 0;
        w.perDay.set(date, prev);
      }
    }
    return Array.from(byWorker.values()).map((w) => {
      const series = allDays.map((d) => ({ date: d, ...(w.perDay.get(d) ?? { work: 0, brk: 0 }), worked: w.perDay.has(d) }));
      const workedDays = series.filter((s) => s.worked);
      const totalWork = workedDays.reduce((s, x) => s + x.work, 0);
      const totalBreak = workedDays.reduce((s, x) => s + x.brk, 0);
      const avgBreak = workedDays.length > 0 ? totalBreak / workedDays.length : 0;
      return { ...w, series, workedDaysCount: workedDays.length, totalWork, totalBreak, avgBreak };
    }).sort((a, b) => b.totalWork - a.totalWork);
  }, [reports, selectedWorker, workerNames, from, to]);

  const sym = CURRENCY_SYMBOLS[totals.currency] ?? "€";
  const fmtMoney = (n: number) => `${sym}${n.toFixed(0)}`;

  const zoneClass = (breakMins: number, workMins: number, worked: boolean) => {
    if (!worked) return "bg-muted-foreground/20";
    return bandClass(breakBand(breakMins, workMins));
  };


  return (
    <section className="space-y-2">
      {/* Range + worker pills */}
      <div className="space-y-2">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedWorker("all")}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${selectedWorker === "all" ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border"}`}
          >
            All freelancers
          </button>
          {workers.map((w) => {
            const color = getClientColor(w.id);
            const active = selectedWorker === w.id;
            return (
              <button
                key={w.id}
                onClick={() => setSelectedWorker(w.id)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors flex items-center gap-1.5 ${active ? "border-foreground" : "border-border"}`}
                style={active ? { backgroundColor: color, color: "#fff", borderColor: color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                {w.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Wages dashboard — compact */}
      <Card className="p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total wages</span>
            <span className="text-xl font-bold font-mono tracking-tight">{sym}{totals.total.toFixed(2)}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{filteredReports.length} rpt</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-md bg-emerald-500/10 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1"><Coins className="w-2.5 h-2.5" /> Paid</p>
            <p className="text-xs font-mono font-bold mt-0.5">{fmtMoney(totals.paid)}</p>
          </div>
          <div className={`rounded-md px-2 py-1.5 ${totals.pending > 0 ? "bg-amber-500/10" : "bg-muted"}`}>
            <p className={`text-[9px] uppercase tracking-wide font-semibold flex items-center gap-1 ${totals.pending > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}><Clock3 className="w-2.5 h-2.5" /> Pending</p>
            <p className="text-xs font-mono font-bold mt-0.5">{fmtMoney(totals.pending)}</p>
          </div>
          <div className={`rounded-md px-2 py-1.5 ${totals.overdue > 0 ? "bg-red-500/10" : "bg-muted"}`}>
            <p className={`text-[9px] uppercase tracking-wide font-semibold flex items-center gap-1 ${totals.overdue > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}><AlertTriangle className="w-2.5 h-2.5" /> Overdue</p>
            <p className="text-xs font-mono font-bold mt-0.5">{fmtMoney(totals.overdue)}</p>
          </div>
        </div>
      </Card>

      {/* Work pattern — collapsible to keep To-date status above the fold */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setBreaksOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Coffee className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Work pattern</span>
            <span className="text-[10px] text-muted-foreground">avg shift & break per worked day</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${breaksOpen ? "rotate-180" : ""}`} />
        </button>

        {breaksOpen && (
          <div className="border-t border-border px-3 py-2 space-y-1.5">

            {workerBreaks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-2">No freelancer data in this range.</p>
            ) : (
              (() => {
                const maxAvgTotal = Math.max(
                  1,
                  ...workerBreaks.map((w) =>
                    w.workedDaysCount > 0 ? (w.totalWork / w.workedDaysCount) + w.avgBreak : 0,
                  ),
                );
                return workerBreaks.map((w) => {
                  const color = getClientColor(w.id);
                  const avg = Math.round(w.avgBreak);
                  const avgWork = w.workedDaysCount > 0 ? w.totalWork / w.workedDaysCount : 0;
                  const isOpen = expandedWorker === w.id;
                  const avgZone = zoneClass(avg, avgWork, w.workedDaysCount > 0);
                  const totalPct = ((avgWork + w.avgBreak) / maxAvgTotal) * 100;
                  const workShare = avgWork + w.avgBreak > 0 ? avgWork / (avgWork + w.avgBreak) : 1;

                  return (
                    <div key={w.id} className="rounded-md bg-muted/30">
                      <button
                        onClick={() => setExpandedWorker(isOpen ? null : w.id)}
                        className="w-full flex items-center gap-2 px-2 py-2"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs font-semibold flex-1 text-left truncate">{w.name}</span>
                        {/* Avg-shift bar: total length = work + break (scaled across workers).
                            Left segment = work (break-adequacy color). Right segment = break (slate). */}
                        <div className="relative w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="flex h-full"
                            style={{ width: `${Math.max(4, totalPct)}%` }}
                          >
                            <div className={avgZone} style={{ width: `${workShare * 100}%` }} />
                            <div className="bg-slate-400 dark:bg-slate-500" style={{ width: `${(1 - workShare) * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-semibold w-12 text-right">{fmtHm(avgWork)}</span>
                        <span className="text-[10px] font-mono text-muted-foreground w-9 text-right">{avg}m brk</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>


                    {isOpen && (
                      <div className="px-2 pb-2 space-y-2 border-t border-border/50">
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <div>
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Worked</p>
                            <p className="text-xs font-mono font-bold">{fmtHm(w.totalWork)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Breaks</p>
                            <p className="text-xs font-mono font-bold">{fmtHm(w.totalBreak)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Days</p>
                            <p className="text-xs font-mono font-bold">{w.workedDaysCount}</p>
                          </div>
                        </div>

                        {/* Per-day capsule strip — 1 capsule = 1 day, dark fill = that day's break minutes (0–60m scale) */}
                        <div>
                          <div className="flex items-end gap-0.5 h-12">
                            {(w.series.length > 21 ? w.series.slice(-21) : w.series).map((d) => {
                              const pct = Math.min(100, (d.brk / Y_MAX) * 100);
                              const cls = zoneClass(d.brk, d.work, d.worked);
                              return (
                                <div
                                  key={d.date}
                                  className="flex-1 h-full bg-muted rounded-sm overflow-hidden relative"
                                  title={`${d.date}: ${d.worked ? `${Math.round(d.brk)}m break · ${fmtHm(d.work)} worked` : "no work"}`}
                                >
                                  {d.worked && (
                                    <div className={`absolute inset-x-0 bottom-0 ${cls}`} style={{ height: `${Math.max(pct, 6)}%` }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                            <span>{w.series.length > 21 ? "last 21 days" : "0m"}</span>
                            <span>90m</span>
                          </div>
                        </div>

                        <p className="text-[10px] text-muted-foreground">
                          Targets adjust to the day's hours: under 4h → up to 30m, 4–6h → 15–45m, 6h+ → 45–75m (PT law: ≥45m at 6h+).
                        </p>
                      </div>
                    )}
                  </div>
                  );
                });
              })()
            )}

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground pt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Healthy (varies w/ day length)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Too short / too long</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> No break on 6h+ day</span>
            </div>

          </div>
        )}
      </Card>
    </section>
  );
};

export default EmployerDashboardSection;
