import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Check, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import RecordPaymentSheet from "./RecordPaymentSheet";
import WorkerEditForm from "./WorkerEditForm";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatPeriod = (start: string, end: string) => {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${s.toLocaleDateString("en-GB", opts)} – ${e.toLocaleDateString("en-GB", opts)}`;
};

interface Report {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  total_hours: number;
  currency: string;
  status: string;
  submitted_at: string;
}

interface Props {
  workerUserId: string;
  employerUserId: string;
  clientId: string;
}

const WorkerDetailsSection = ({ workerUserId, employerUserId, clientId }: Props) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [paidMap, setPaidMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [paymentReport, setPaymentReport] = useState<Report | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rRows } = await supabase
      .from("submitted_reports")
      .select("id, period_start, period_end, total_amount, total_hours, currency, status, submitted_at")
      .eq("employer_user_id", employerUserId)
      .eq("worker_user_id", workerUserId)
      .in("status", ["submitted", "approved"])
      .order("period_end", { ascending: false })
      .limit(8);
    const list = (rRows ?? []) as Report[];
    const pm = new Map<string, number>();
    const approvedIds = list.filter((r) => r.status === "approved").map((r) => r.id);
    if (approvedIds.length > 0) {
      const { data: pRows } = await supabase
        .from("report_payments")
        .select("submitted_report_id, amount")
        .in("submitted_report_id", approvedIds);
      for (const p of (pRows ?? []) as any[]) {
        pm.set(p.submitted_report_id, (pm.get(p.submitted_report_id) ?? 0) + Number(p.amount));
      }
    }
    setReports(list);
    setPaidMap(pm);
    setLoading(false);
  }, [workerUserId, employerUserId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (reports.length === 0) return <p className="text-xs text-muted-foreground">No reports yet.</p>;

  const pending = reports.filter((r) => r.status === "submitted");
  const approved = reports.filter((r) => r.status === "approved");

  return (
    <div className="space-y-4">
      <WorkerEditForm clientId={clientId} />
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Awaiting review
          </p>
          <div className="space-y-2">
            {pending.map((r) => {
              const sym = CURRENCY_SYMBOLS[r.currency] ?? "€";
              return (
                <div key={r.id} className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs flex-1 truncate">{formatPeriod(r.period_start, r.period_end)}</p>
                  <p className="text-xs font-mono font-semibold">{sym}{Number(r.total_amount).toFixed(2)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {approved.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wallet className="w-3 h-3" /> Approved & payments
          </p>
          <div className="space-y-2">
            {approved.map((r) => {
              const sym = CURRENCY_SYMBOLS[r.currency] ?? "€";
              const total = Number(r.total_amount);
              const paid = paidMap.get(r.id) ?? 0;
              const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
              const fullyPaid = paid + 0.005 >= total;
              const remaining = Math.max(0, total - paid);
              return (
                <div key={r.id} className="p-2.5 rounded-lg border border-border bg-muted/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs flex-1 truncate">{formatPeriod(r.period_start, r.period_end)}</p>
                    <p className="text-xs font-mono font-semibold">{sym}{total.toFixed(2)}</p>
                  </div>
                  <div className="h-1 rounded-full bg-background overflow-hidden">
                    <div
                      className={`h-full ${fullyPaid ? "bg-foreground" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-muted-foreground font-mono flex-1">
                      {fullyPaid ? (
                        <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Paid</span>
                      ) : (
                        <span>{sym}{paid.toFixed(2)} paid · {sym}{remaining.toFixed(2)} due</span>
                      )}
                    </div>
                    {!fullyPaid && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg text-xs"
                        onClick={() => setPaymentReport(r)}
                      >
                        Record payment
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <RecordPaymentSheet
        open={!!paymentReport}
        onOpenChange={(o) => { if (!o) setPaymentReport(null); }}
        reportId={paymentReport?.id ?? null}
        currency={paymentReport?.currency ?? "EUR"}
        totalAmount={Number(paymentReport?.total_amount ?? 0)}
        alreadyPaid={paymentReport ? (paidMap.get(paymentReport.id) ?? 0) : 0}
        recorderUserId={employerUserId}
        onRecorded={() => { setPaymentReport(null); load(); }}
      />
    </div>
  );
};

export default WorkerDetailsSection;
