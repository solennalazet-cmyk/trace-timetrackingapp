import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Check } from "lucide-react";

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
  currency: string;
}

interface Props {
  clientId: string;
  workerUserId: string;
}

const ClientPaymentsSection = ({ clientId, workerUserId }: Props) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [paidMap, setPaidMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: rRows } = await supabase
        .from("submitted_reports")
        .select("id, period_start, period_end, total_amount, currency")
        .eq("worker_user_id", workerUserId)
        .eq("client_id", clientId)
        .eq("status", "approved")
        .order("period_end", { ascending: false })
        .limit(10);
      const list = (rRows ?? []) as Report[];
      let pm = new Map<string, number>();
      if (list.length > 0) {
        const { data: pRows } = await supabase
          .from("report_payments")
          .select("submitted_report_id, amount")
          .in("submitted_report_id", list.map((r) => r.id));
        for (const p of (pRows ?? []) as any[]) {
          pm.set(p.submitted_report_id, (pm.get(p.submitted_report_id) ?? 0) + Number(p.amount));
        }
      }
      if (cancelled) return;
      setReports(list);
      setPaidMap(pm);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, workerUserId]);

  if (loading) return null;
  if (reports.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Wallet className="w-3 h-3" /> Payments
      </p>
      <div className="space-y-2">
        {reports.map((r) => {
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
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                {fullyPaid ? (
                  <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Paid</span>
                ) : (
                  <span>{sym}{paid.toFixed(2)} paid</span>
                )}
                <span>{fullyPaid ? "100%" : `${sym}${remaining.toFixed(2)} due`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClientPaymentsSection;
