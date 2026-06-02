import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Plus, Check, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import RecordPaymentSheet from "@/components/RecordPaymentSheet";
import { toast } from "sonner";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatPeriod = (start: string, end: string) => {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${s.toLocaleDateString("en-GB", opts)} – ${e.toLocaleDateString("en-GB", opts)}`;
};

const formatDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

interface ReportRow {
  id: string;
  worker_user_id: string;
  employer_user_id: string | null;
  client_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  status: string;
  reviewed_at: string | null;
}

interface PaymentRow {
  id: string;
  submitted_report_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  note: string | null;
  recorded_by_user_id: string;
}

const PaymentsPage = () => {
  const { user } = useAuth();
  const { activeRole } = useRole();
  const isEmployer = activeRole === "employer";

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [partyNames, setPartyNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [recordOpen, setRecordOpen] = useState(false);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const col = isEmployer ? "employer_user_id" : "worker_user_id";
    const { data: rRows } = await supabase
      .from("submitted_reports")
      .select("id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_amount, currency, status, reviewed_at")
      .eq(col, user.id)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false });

    const list = (rRows ?? []) as ReportRow[];
    setReports(list);

    if (list.length > 0) {
      const ids = list.map((r) => r.id);
      const { data: payRows } = await supabase.from("report_payments").select("*").in("submitted_report_id", ids);
      setPayments((payRows ?? []) as PaymentRow[]);

      const nameMap = new Map<string, string>();
      if (isEmployer) {
        const workerIds = Array.from(new Set(list.map((r) => r.worker_user_id))).filter(Boolean);
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", workerIds);
        const profMap = new Map((profiles ?? []).map((p: any) => [p.id, (p.full_name as string) || "Worker"]));
        for (const r of list) nameMap.set(r.id, profMap.get(r.worker_user_id) ?? "Worker");
      } else {
        const clientIds = Array.from(new Set(list.map((r) => r.client_id))).filter(Boolean);
        const { data: clientRows } = await supabase.from("clients").select("id, name").in("id", clientIds);
        const cMap = new Map((clientRows ?? []).map((c: any) => [c.id, c.name as string]));
        for (const r of list) nameMap.set(r.id, cMap.get(r.client_id) ?? "Client");
      }
      setPartyNames(nameMap);
    } else {
      setPayments([]);
      setPartyNames(new Map());
    }
    setLoading(false);
  }, [user, isEmployer]);

  useEffect(() => { load(); }, [load]);

  const paidByReport = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.submitted_report_id, (m.get(p.submitted_report_id) ?? 0) + Number(p.amount));
    return m;
  }, [payments]);

  const { outstanding, paidUp } = useMemo(() => {
    const out: ReportRow[] = []; const done: ReportRow[] = [];
    for (const r of reports) {
      const paid = paidByReport.get(r.id) ?? 0;
      if (paid + 0.005 >= Number(r.total_amount)) done.push(r);
      else out.push(r);
    }
    return { outstanding: out, paidUp: done };
  }, [reports, paidByReport]);

  const totals = useMemo(() => {
    const byCurrency = new Map<string, { outstanding: number; paid: number }>();
    for (const r of reports) {
      const total = Number(r.total_amount);
      const paid = paidByReport.get(r.id) ?? 0;
      const entry = byCurrency.get(r.currency) ?? { outstanding: 0, paid: 0 };
      entry.outstanding += Math.max(0, total - paid);
      entry.paid += Math.min(total, paid);
      byCurrency.set(r.currency, entry);
    }
    return Array.from(byCurrency.entries());
  }, [reports, paidByReport]);

  const activeReport = reports.find((r) => r.id === activeReportId) ?? null;

  const handleRecord = (r: ReportRow) => {
    setActiveReportId(r.id);
    setRecordOpen(true);
  };

  const handleDeletePayment = async (id: string) => {
    const { error } = await supabase.from("report_payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment removed.");
    load();
  };

  const renderReportCard = (r: ReportRow, fullyPaid: boolean) => {
    const sym = CURRENCY_SYMBOLS[r.currency] ?? "€";
    const paid = paidByReport.get(r.id) ?? 0;
    const total = Number(r.total_amount);
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    const remaining = Math.max(0, total - paid);
    const partyName = clientNames.get(r.client_id) ?? (isEmployer ? "Worker" : "Client");
    const reportPayments = payments.filter((p) => p.submitted_report_id === r.id);

    return (
      <Card key={r.id} className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{partyName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatPeriod(r.period_start, r.period_end)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold">{sym}{total.toFixed(2)}</p>
            {!fullyPaid && paid > 0 && (
              <p className="text-[11px] text-muted-foreground font-mono">{sym}{remaining.toFixed(2)} due</p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${fullyPaid ? "bg-foreground" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
            <span>{sym}{paid.toFixed(2)} paid</span>
            <span>{pct}%</span>
          </div>
        </div>

        {reportPayments.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border">
            {reportPayments.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{formatDate(p.paid_at)}</span>
                <span className="font-mono font-medium">{sym}{Number(p.amount).toFixed(2)}</span>
                {p.note && <span className="text-muted-foreground truncate flex-1">· {p.note}</span>}
                {p.recorded_by_user_id === user?.id && (
                  <button
                    onClick={() => handleDeletePayment(p.id)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="Remove payment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {isEmployer && !fullyPaid && (
          <Button
            size="sm"
            className="w-full rounded-lg gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => handleRecord(r)}
          >
            <Plus className="w-4 h-4" /> Record payment
          </Button>
        )}
        {fullyPaid && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="w-3.5 h-3.5" /> Fully paid
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="pt-6 space-y-4 pb-24">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          {isEmployer ? "Track what's owed and record payments." : "See what's been paid against your approved reports."}
        </p>
      </header>

      {!loading && totals.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Outstanding</p>
            <div className="mt-1 space-y-0.5">
              {totals.map(([cur, t]) => (
                <p key={cur} className="text-sm font-mono font-semibold">
                  {CURRENCY_SYMBOLS[cur] ?? cur}{t.outstanding.toFixed(2)}
                </p>
              ))}
            </div>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Paid</p>
            <div className="mt-1 space-y-0.5">
              {totals.map(([cur, t]) => (
                <p key={cur} className="text-sm font-mono font-semibold">
                  {CURRENCY_SYMBOLS[cur] ?? cur}{t.paid.toFixed(2)}
                </p>
              ))}
            </div>
          </Card>
        </div>
      )}


      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Outstanding</h2>
        {loading ? (
          <Card className="p-4 text-xs text-muted-foreground text-center">Loading…</Card>
        ) : outstanding.length === 0 ? (
          <Card className="p-6 text-center">
            <Wallet className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Nothing outstanding</p>
            <p className="text-xs text-muted-foreground mt-1">
              Approved reports awaiting payment will appear here.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">{outstanding.map((r) => renderReportCard(r, false))}</div>
        )}
      </section>

      {paidUp.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold px-1">Paid</h2>
          <div className="space-y-2">{paidUp.map((r) => renderReportCard(r, true))}</div>
        </section>
      )}

      <RecordPaymentSheet
        open={recordOpen}
        onOpenChange={(v) => { setRecordOpen(v); if (!v) load(); }}
        reportId={activeReportId}
        currency={activeReport?.currency ?? "EUR"}
        totalAmount={Number(activeReport?.total_amount ?? 0)}
        alreadyPaid={activeReportId ? (paidByReport.get(activeReportId) ?? 0) : 0}
        recorderUserId={user?.id ?? ""}
        onRecorded={load}
      />
    </div>
  );
};

export default PaymentsPage;
