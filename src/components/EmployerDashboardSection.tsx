import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Coffee, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getClientColor, toLocalDateKey } from "@/lib/utils";
import DateRangePicker from "@/components/DateRangePicker";
import PaymentsPage from "@/pages/PaymentsPage";

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
  const navigate = useNavigate();
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

      // Resolve worker display names from this employer's own contractor
      // client rows (same source as the Freelancers page). The `profiles`
      // table is RLS-restricted to each user's own row, so it returns nothing
      // for the employer and every pill collapses to "Freelancer".
      const workerUserIds = Array.from(new Set(rows.map((r) => r.worker_user_id))).filter(Boolean);
      const nameMap = new Map<string, string>();
      if (workerUserIds.length > 0) {
        const { data: cRows } = await supabase
          .from("clients")
          .select("connected_user_id, name")
          .eq("user_id", user.id)
          .in("kind", ["contractor", "both"])
          .eq("connection_status", "accepted")
          .in("connected_user_id", workerUserIds);
        const byUser = new Map<string, string>();
        for (const c of (cRows ?? []) as any[]) {
          if (c.connected_user_id && c.name) byUser.set(c.connected_user_id, c.name);
        }
        for (const wid of workerUserIds) {
          nameMap.set(wid, byUser.get(wid) ?? "Freelancer");
        }
      }
      if (!cancelled) setWorkerNames(nameMap);
    })();
    return () => { cancelled = true; };
  }, [user, from, to, refreshKey]);

  const workers = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const r of reports) {
      if (!r.worker_user_id) continue;
      if (!m.has(r.worker_user_id)) {
        m.set(r.worker_user_id, { id: r.worker_user_id, name: workerNames.get(r.worker_user_id) ?? "Freelancer" });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [reports, workerNames]);

  const filteredReports = useMemo(
    () => selectedWorker === "all" ? reports : reports.filter((r) => r.worker_user_id === selectedWorker),
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
      if (selectedWorker !== "all" && r.worker_user_id !== selectedWorker) continue;
      if (!r.worker_user_id) continue;
      let w = byWorker.get(r.worker_user_id);
      if (!w) {
        w = { id: r.worker_user_id, name: workerNames.get(r.worker_user_id) ?? "Freelancer", perDay: new Map() };
        byWorker.set(r.worker_user_id, w);
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

      {/* Payments — full set of cards migrated from the standalone /payments page */}
      <PaymentsPage embedded />


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
          <div className="border-t border-border px-3 py-2 space-y-2">

            {workerBreaks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-2">No freelancer data in this range.</p>
            ) : selectedWorker === "all" ? (
              // ───── Stacked hours per day across all freelancers ─────
              (() => {
                const dayMs = 86400000;
                const days: string[] = [];
                for (let t = new Date(from).getTime(); t <= to.getTime(); t += dayMs) {
                  days.push(toLocalDateKey(new Date(t)));
                }
                const perDay = days.map((d) => {
                  const stacks = workerBreaks
                    .map((w) => {
                      const entry = w.series.find((s) => s.date === d);
                      return { id: w.id, name: w.name, mins: entry?.work ?? 0 };
                    })
                    .filter((s) => s.mins > 0);
                  const total = stacks.reduce((s, x) => s + x.mins, 0);
                  return { date: d, stacks, total };
                });
                const maxTotal = Math.max(1, ...perDay.map((d) => d.total));
                const grandTotal = perDay.reduce((s, d) => s + d.total, 0);
                // Cap rendered bars to keep them legible on mobile.
                const MAX_BARS = 31;
                const visible = perDay.length > MAX_BARS ? perDay.slice(-MAX_BARS) : perDay;

                return (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between px-1">
                      <p className="text-[11px] font-semibold">Hours by freelancer</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {fmtHm(grandTotal)} · {visible.length}{perDay.length > visible.length ? ` / ${perDay.length}` : ""}d
                      </p>
                    </div>
                    <div className="flex items-end gap-0.5 h-28">
                      {visible.map((d) => {
                        const heightPct = (d.total / maxTotal) * 100;
                        const title = d.total > 0
                          ? `${d.date}: ${fmtHm(d.total)}\n` + d.stacks.map((s) => `• ${s.name}: ${fmtHm(s.mins)}`).join("\n")
                          : `${d.date}: no work`;
                        return (
                          <div key={d.date} className="flex-1 h-full flex flex-col justify-end" title={title}>
                            <div
                              className="w-full rounded-sm overflow-hidden flex flex-col bg-muted/40"
                              style={{ height: `${Math.max(heightPct, 2)}%` }}
                            >
                              {d.stacks.map((s) => {
                                const segPct = d.total > 0 ? (s.mins / d.total) * 100 : 0;
                                return (
                                  <div
                                    key={s.id}
                                    style={{ height: `${segPct}%`, backgroundColor: getClientColor(s.id) }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground px-1">
                      <span>{new Date(visible[0].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                      <span>0–{Math.ceil(maxTotal / 60)}h/day</span>
                      <span>{new Date(visible[visible.length - 1].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    </div>
                    {/* Legend per freelancer with totals */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                      {workerBreaks.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => setSelectedWorker(w.id)}
                          className="flex items-center gap-1.5 text-[10px] hover:opacity-80"
                        >
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getClientColor(w.id) }} />
                          <span className="text-foreground font-medium truncate max-w-[100px]">{w.name}</span>
                          <span className="text-muted-foreground font-mono">{fmtHm(w.totalWork)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : (
              // ───── Single-freelancer break pattern ─────
              (() => {
                const w = workerBreaks[0];
                if (!w) return null;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getClientColor(w.id) }} />
                      <span className="text-xs font-semibold flex-1 truncate">{w.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
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

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Healthy (varies w/ day length)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Too short / too long</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> No break on 6h+ day</span>
                    </div>
                  </div>
                );
              })()
            )}

          </div>
        )}
      </Card>
    </section>
  );
};


export default EmployerDashboardSection;
