import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getClientColor, toLocalDateKey } from "@/lib/utils";
import DateRangePicker from "@/components/DateRangePicker";
import PaymentsPage from "@/pages/PaymentsPage";
import WorkPatternCard from "@/components/WorkPatternCard";

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
const EmployerDashboardSection = ({ refreshKey, breaksDefaultOpen = false }: Props) => {
  const { user } = useAuth();
  
  const [from, setFrom] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0,0,0,0); return d; });
  const [to, setTo] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [paidByReport, setPaidByReport] = useState<Map<string, number>>(new Map());
  const [workerNames, setWorkerNames] = useState<Map<string, string>>(new Map());
  const [allFreelancers, setAllFreelancers] = useState<{ id: string; name: string }[]>([]);
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

  const sym = CURRENCY_SYMBOLS[totals.currency] ?? "€";
  const fmtMoney = (n: number) => `${sym}${n.toFixed(0)}`;

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
