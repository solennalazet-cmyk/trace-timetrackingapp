import { useCallback, useEffect, useState } from "react";
import { Users, Wallet, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

interface Totals {
  freelancers: number;
  approvedTotal: number;
  paidTotal: number;
  currency: string;
  lastPaymentAmount: number;
  lastPaymentDate: string | null;
}

const EmployerRightPanel = () => {
  const { user } = useAuth();
  const [totals, setTotals] = useState<Totals>({
    freelancers: 0,
    approvedTotal: 0,
    paidTotal: 0,
    currency: "EUR",
    lastPaymentAmount: 0,
    lastPaymentDate: null,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const [freelancersRes, reportsRes, paymentsRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("connection_status", "accepted"),
      supabase
        .from("submitted_reports")
        .select("id, total_amount, currency, status")
        .eq("employer_user_id", user.id)
        .in("status", ["approved", "paid"]),
      supabase
        .from("report_payments")
        .select("amount, currency, paid_at, created_at")
        .eq("recorded_by_user_id", user.id)
        .order("paid_at", { ascending: false }),
    ]);

    const reports = (reportsRes.data ?? []) as any[];
    const payments = (paymentsRes.data ?? []) as any[];
    const currency = reports[0]?.currency ?? payments[0]?.currency ?? "EUR";
    const approvedTotal = reports.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    const paidTotal = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const last = payments[0];

    setTotals({
      freelancers: freelancersRes.count ?? 0,
      approvedTotal,
      paidTotal,
      currency,
      lastPaymentAmount: last ? Number(last.amount ?? 0) : 0,
      lastPaymentDate: last?.paid_at ?? null,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("pending-reports-changed", refresh);
    window.addEventListener("trace-invites-changed", refresh);
    const interval = setInterval(load, 30000);
    return () => {
      window.removeEventListener("pending-reports-changed", refresh);
      window.removeEventListener("trace-invites-changed", refresh);
      clearInterval(interval);
    };
  }, [load]);

  const sym = CURRENCY_SYMBOLS[totals.currency] ?? "€";
  const outstanding = Math.max(0, totals.approvedTotal - totals.paidTotal);
  const carryOver = Math.max(0, outstanding - totals.lastPaymentAmount);

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:py-6 lg:px-4 lg:border-l border-border/40 overflow-y-auto"
      style={{ backgroundColor: "hsl(var(--card) / 0.4)", backdropFilter: "blur(12px)" }}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Team overview</h2>
        <p className="text-[11px] text-muted-foreground">Across all your freelancers</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Connected freelancers</p>
        </div>
        <p className="text-2xl font-bold font-mono">{loading ? "…" : totals.freelancers}</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total due (approved)</p>
        </div>
        <p className="text-2xl font-bold font-mono">{sym}{totals.approvedTotal.toFixed(2)}</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Paid to date: <span className="font-mono">{sym}{totals.paidTotal.toFixed(2)}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Outstanding</p>
        </div>
        <p className="text-2xl font-bold font-mono">{sym}{outstanding.toFixed(2)}</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Carried over from prior period: <span className="font-mono">{sym}{carryOver.toFixed(2)}</span>
        </p>
      </div>

      {totals.lastPaymentDate && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground">Last payment</p>
            <p className="text-xs font-semibold font-mono">
              {sym}{totals.lastPaymentAmount.toFixed(2)} · {new Date(totals.lastPaymentDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
};

export default EmployerRightPanel;
