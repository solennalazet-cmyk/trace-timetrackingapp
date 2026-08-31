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
  
  const [from, setFrom] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; });
  const [to, setTo] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [paidByReport, setPaidByReport] = useState<Map<string, number>>(new Map());
  const [workerNames, setWorkerNames] = useState<Map<string, string>>(new Map());
  const [allFreelancers, setAllFreelancers] = useState<{ id: string; name: string }[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<string | "all">("all");
  const [breaksOpen, setBreaksOpen] = useState(breaksDefaultOpen);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

      // Pull every accepted contractor so the filter pills always list all
      // connected freelancers — not only those with reports in the current range.
      const { data: contractorRows } = await supabase
        .from("clients")
        .select("connected_user_id, name")
        .eq("user_id", user.id)
        .in("kind", ["contractor", "both"])
        .eq("connection_status", "accepted");
      const nameMap = new Map<string, string>();
      const freelancerList: { id: string; name: string }[] = [];
      for (const c of (contractorRows ?? []) as any[]) {
        if (!c.connected_user_id) continue;
        const name = c.name ?? "Freelancer";
        nameMap.set(c.connected_user_id, name);
        freelancerList.push({ id: c.connected_user_id, name });
      }
      // Fall back to "Freelancer" label for any reporter not in the contractor list.
      for (const wid of Array.from(new Set(rows.map((r) => r.worker_user_id))).filter(Boolean)) {
        if (!nameMap.has(wid)) nameMap.set(wid, "Freelancer");
      }
      if (!cancelled) {
        setWorkerNames(nameMap);
        setAllFreelancers(freelancerList.sort((a, b) => a.name.localeCompare(b.name)));
      }
    })();
    return () => { cancelled = true; };
  }, [user, from, to, refreshKey]);

  const workers = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const f of allFreelancers) m.set(f.id, f);
    for (const r of reports) {
      if (!r.worker_user_id || m.has(r.worker_user_id)) continue;
      m.set(r.worker_user_id, { id: r.worker_user_id, name: workerNames.get(r.worker_user_id) ?? "Freelancer" });
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allFreelancers, reports, workerNames]);


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
    type DaySession = { start?: string; end?: string; duration: number; brk: number };
    const byWorker = new Map<string, { id: string; name: string; perDay: Map<string, { work: number; brk: number; sessions: DaySession[] }>; seenEntries: Set<string> }>();
    for (const r of reports) {
      if (selectedWorker !== "all" && r.worker_user_id !== selectedWorker) continue;
      if (!r.worker_user_id) continue;
      let w = byWorker.get(r.worker_user_id);
      if (!w) {
        w = { id: r.worker_user_id, name: workerNames.get(r.worker_user_id) ?? "Freelancer", perDay: new Map(), seenEntries: new Set() };
        byWorker.set(r.worker_user_id, w);
      }
      const snap = Array.isArray(r.entries_snapshot) ? r.entries_snapshot : [];
      for (const e of snap) {
        const date = e.entry_date as string | undefined;
        if (!date || date < fromKey || date > toKey) continue;
        // Dedupe the same time entry appearing across multiple submitted reports
        // (e.g. overlapping periods or resubmissions) so we don't multi-count it.
        const dedupeKey = String(e.id ?? `${date}|${e.start_time ?? ""}|${e.end_time ?? ""}|${e.duration_minutes ?? ""}`);
        if (w.seenEntries.has(dedupeKey)) continue;
        w.seenEntries.add(dedupeKey);
        const prev = w.perDay.get(date) ?? { work: 0, brk: 0, sessions: [] };
        const dur = Number(e.duration_minutes) || 0;
        const brk = Number(e.break_minutes) || 0;
        prev.work += dur;
        prev.brk += brk;
        prev.sessions.push({ start: e.start_time, end: e.end_time, duration: dur, brk });
        w.perDay.set(date, prev);
      }
    }
    return Array.from(byWorker.values()).map((w) => {
      const series = allDays.map((d) => {
        const day = w.perDay.get(d);
        return { date: d, work: day?.work ?? 0, brk: day?.brk ?? 0, sessions: day?.sessions ?? [] as DaySession[], worked: !!day };
      });
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
      <PaymentsPage embedded selectedWorker={selectedWorker} />


      {/* Work pattern — weekly averages, actionable stats, tap-to-scope weeks */}
      <WorkPatternCard
        reports={reports}
        workerNames={workerNames}
        from={from}
        to={to}
        selectedWorker={selectedWorker}
        onSelectWorker={setSelectedWorker}
        defaultOpen={breaksDefaultOpen}
      />
    </section>
  );
};



export default EmployerDashboardSection;
