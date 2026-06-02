import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, ChevronLeft, ChevronRight, Pencil, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWeekStart } from "@/contexts/WeekStartContext";
import { toLocalDateKey } from "@/lib/utils";
import SubmittedReportSheet, { type SubmittedReport } from "@/components/SubmittedReportSheet";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };
const OVERDUE_DAYS = 30; // default payment terms — overdue if period_end is older than this and unpaid

type Range = "weekly" | "biweekly" | "monthly";

interface Report {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  status: string;
  submitted_at: string;
}

interface Payment {
  id: string;
  submitted_report_id: string;
  amount: number;
  paid_at: string;
}

interface Props {
  clientId: string;
  workerUserId: string;
}

const startOfWeek = (d: Date, weekStart: number) => {
  const out = new Date(d);
  const day = out.getDay();
  const diff = (day - weekStart + 7) % 7;
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
};
const addDays = (d: Date, n: number) => { const o = new Date(d); o.setDate(o.getDate() + n); return o; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

const computePeriod = (anchor: Date, range: Range, weekStart: number): { start: Date; end: Date } => {
  if (range === "monthly") return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  const ws = startOfWeek(anchor, weekStart);
  if (range === "biweekly") return { start: ws, end: addDays(ws, 13) };
  return { start: ws, end: addDays(ws, 6) };
};

const shiftPeriod = (anchor: Date, range: Range, dir: -1 | 1): Date => {
  if (range === "monthly") return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return addDays(anchor, dir * (range === "biweekly" ? 14 : 7));
};

const formatRange = (s: Date, e: Date) => {
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric" }
    : { day: "numeric", month: "short" };
  return `${s.toLocaleDateString("en-GB", opts)} – ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
};

const formatShort = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const ClientPaymentsSection = ({ clientId, workerUserId }: Props) => {
  const weekStart = useWeekStart();
  const [range, setRange] = useState<Range>("weekly");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [reports, setReports] = useState<Report[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toLocalDateKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [openReport, setOpenReport] = useState<SubmittedReport | null>(null);

  // Load user's default report range once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("default_report_range")
        .eq("user_id", workerUserId)
        .maybeSingle();
      if (cancelled) return;
      const r = (data?.default_report_range ?? "weekly") as Range;
      if (r === "weekly" || r === "biweekly" || r === "monthly") setRange(r);
    })();
    return () => { cancelled = true; };
  }, [workerUserId]);

  const period = useMemo(() => computePeriod(anchor, range, weekStart), [anchor, range, weekStart]);
  const periodStartKey = toLocalDateKey(period.start);
  const periodEndKey = toLocalDateKey(period.end);

  const loadData = async () => {
    setLoading(true);
    // Reports that overlap with the period
    const { data: rRows } = await supabase
      .from("submitted_reports")
      .select("id, period_start, period_end, total_amount, currency, status, submitted_at")
      .eq("worker_user_id", workerUserId)
      .eq("client_id", clientId)
      .in("status", ["submitted", "approved"])
      .lte("period_start", periodEndKey)
      .gte("period_end", periodStartKey)
      .order("period_end", { ascending: true });
    const list = (rRows ?? []) as Report[];

    let pays: Payment[] = [];
    if (list.length > 0) {
      const { data: pRows } = await supabase
        .from("report_payments")
        .select("id, submitted_report_id, amount, paid_at")
        .in("submitted_report_id", list.map((r) => r.id));
      pays = (pRows ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) }));
    }
    setReports(list);
    setPayments(pays);
    setLoading(false);
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [clientId, workerUserId, periodStartKey, periodEndKey]);

  const currency = reports[0]?.currency ?? "EUR";
  const sym = CURRENCY_SYMBOLS[currency] ?? "€";

  const paidByReport = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.submitted_report_id, (m.get(p.submitted_report_id) ?? 0) + p.amount);
    return m;
  }, [payments]);

  const { totalDue, totalPaid, totalOverdue, unpaidOrdered } = useMemo(() => {
    let due = 0, paid = 0, overdue = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const unpaid: Report[] = [];
    for (const r of reports) {
      const t = Number(r.total_amount);
      const p = paidByReport.get(r.id) ?? 0;
      due += t;
      paid += Math.min(t, p);
      const remaining = Math.max(0, t - p);
      if (remaining > 0.005) {
        unpaid.push(r);
        const pe = new Date(r.period_end + "T00:00:00");
        const ageDays = (today.getTime() - pe.getTime()) / 86400000;
        if (ageDays > OVERDUE_DAYS) overdue += remaining;
      }
    }
    return { totalDue: due, totalPaid: paid, totalOverdue: overdue, unpaidOrdered: unpaid };
  }, [reports, paidByReport]);

  const outstanding = Math.max(0, totalDue - totalPaid);

  // Reset prefill when outstanding changes and not editing
  useEffect(() => {
    if (!editingAmount) setAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
  }, [outstanding, editingAmount]);

  const handleRecord = async () => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (unpaidOrdered.length === 0) {
      toast.error("Nothing to pay in this period.");
      return;
    }
    setSaving(true);
    // FIFO allocate across unpaid reports
    let remaining = numeric;
    const rows: any[] = [];
    for (const r of unpaidOrdered) {
      if (remaining <= 0.005) break;
      const owed = Math.max(0, Number(r.total_amount) - (paidByReport.get(r.id) ?? 0));
      if (owed <= 0.005) continue;
      const amt = Math.min(remaining, owed);
      rows.push({
        submitted_report_id: r.id,
        amount: amt,
        currency: r.currency,
        paid_at: date,
        recorded_by_user_id: workerUserId,
      });
      remaining -= amt;
    }
    // If overpayment, attach the surplus to the last unpaid report
    if (remaining > 0.005 && rows.length > 0) {
      rows[rows.length - 1].amount += remaining;
    }
    const { error } = await supabase.from("report_payments").insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded.");
    setEditingAmount(false);
    setDate(toLocalDateKey(new Date()));
    loadData();
  };

  const openReportOverlay = async (r: Report) => {
    const { data } = await supabase
      .from("submitted_reports")
      .select("*")
      .eq("id", r.id)
      .maybeSingle();
    if (data) setOpenReport(data as SubmittedReport);
  };

  if (loading && reports.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Wallet className="w-3 h-3" /> Payments
        </p>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Wallet className="w-3 h-3" /> Payments
      </p>

      <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
        {/* Period selector */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setAnchor((a) => shiftPeriod(a, range, -1))}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Previous period"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <p className="text-xs font-medium text-foreground">{formatRange(period.start, period.end)}</p>
            <div className="flex gap-1 mt-1 justify-center">
              {(["weekly", "biweekly", "monthly"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {r === "weekly" ? "W" : r === "biweekly" ? "2W" : "M"}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setAnchor((a) => shiftPeriod(a, range, 1))}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Next period"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Due / Paid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Amount Due</p>
            <p className="text-lg font-mono font-bold text-foreground">{sym}{totalDue.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Amount Paid</p>
            <p className="text-lg font-mono font-bold text-foreground">{sym}{totalPaid.toFixed(2)}</p>
          </div>
        </div>

        {/* Overdue */}
        {totalOverdue > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Overdue: <span className="font-mono">{sym}{totalOverdue.toFixed(2)}</span></span>
          </div>
        )}

        {/* Record payment */}
        {outstanding > 0 && (
          <div className="space-y-2 pt-1 border-t border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Record payment</p>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{sym}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  readOnly={!editingAmount}
                  onFocus={() => setEditingAmount(true)}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`h-9 pl-5 pr-8 text-sm font-mono ${editingAmount ? "" : "bg-background/60 text-muted-foreground"}`}
                />
                <button
                  type="button"
                  onClick={() => setEditingAmount((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Edit amount"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-[140px] text-sm"
              />
            </div>
            <Button
              size="sm"
              className="w-full h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={saving}
              onClick={handleRecord}
            >
              {saving ? "Saving…" : "Confirm payment"}
            </Button>
          </div>
        )}

        {/* Reports list */}
        {reports.length > 0 && (
          <div className="pt-1 border-t border-border">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center justify-between w-full text-[10px] uppercase tracking-wider text-muted-foreground font-semibold py-1"
            >
              <span>{reports.length} report{reports.length === 1 ? "" : "s"} in period</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {expanded && (
              <div className="space-y-1 mt-1">
                {reports.map((r) => {
                  const paid = paidByReport.get(r.id) ?? 0;
                  const total = Number(r.total_amount);
                  const fullyPaid = paid + 0.005 >= total;
                  return (
                    <button
                      key={r.id}
                      onClick={() => openReportOverlay(r)}
                      className="flex items-center justify-between w-full text-xs px-2 py-1.5 rounded-md hover:bg-background/60 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span>{formatShort(r.period_start)} – {formatShort(r.period_end)}</span>
                        {r.status === "submitted" && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-foreground/10 text-foreground">Pending</span>
                        )}
                      </span>
                      <span className={`font-mono ${fullyPaid ? "text-muted-foreground line-through" : "text-foreground font-semibold"}`}>
                        {sym}{total.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {reports.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No reports in this period.</p>
        )}
      </div>

      <SubmittedReportSheet
        open={!!openReport}
        onOpenChange={(v) => { if (!v) setOpenReport(null); }}
        report={openReport}
        readOnly
      />
    </div>
  );
};

export default ClientPaymentsSection;
