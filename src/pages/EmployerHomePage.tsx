import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Inbox, Wallet, Activity, ChevronRight, Check, X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SubmittedReportSheet, { type SubmittedReport } from "@/components/SubmittedReportSheet";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatPeriod = (start: string, end: string) => {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${s.toLocaleDateString("en-GB", opts)} – ${e.toLocaleDateString("en-GB", opts)}`;
};

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};

interface ActivityItem {
  id: string;
  ts: string;
  type: "submitted" | "approved" | "rejected" | "payment";
  clientName: string;
  amount?: number;
  currency?: string;
}

const EmployerHomePage = () => {
  const { user } = useAuth();
  const [pending, setPending] = useState<SubmittedReport[]>([]);
  const [approved, setApproved] = useState<SubmittedReport[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SubmittedReport | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [pRes, aRes, recentReviewedRes] = await Promise.all([
      supabase
        .from("submitted_reports")
        .select("*")
        .eq("employer_user_id", user.id)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false }),
      supabase
        .from("submitted_reports")
        .select("*")
        .eq("employer_user_id", user.id)
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false })
        .limit(20),
      supabase
        .from("submitted_reports")
        .select("id, client_id, status, reviewed_at, submitted_at, total_amount, currency")
        .eq("employer_user_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(20),
    ]);

    const reviewedRows = (recentReviewedRes.data ?? []) as any[];
    const allRows = [
      ...((pRes.data ?? []) as any[]),
      ...((aRes.data ?? []) as any[]),
      ...reviewedRows,
    ];
    const clientIds = Array.from(new Set(allRows.map((r) => r.client_id))).filter(Boolean);
    let nameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      nameMap = new Map((clientRows ?? []).map((c: any) => [c.id, c.name]));
    }
    const mapRow = (r: any): SubmittedReport => ({ ...r, client_name: nameMap.get(r.client_id) ?? "Worker" });
    setPending(((pRes.data ?? []) as any[]).map(mapRow));
    setApproved(((aRes.data ?? []) as any[]).map(mapRow));

    // Build activity feed: submissions + review actions + recorded payments
    const items: ActivityItem[] = [];
    for (const r of reviewedRows) {
      items.push({
        id: `s-${r.id}`,
        ts: r.submitted_at,
        type: "submitted",
        clientName: nameMap.get(r.client_id) ?? "Worker",
        amount: Number(r.total_amount),
        currency: r.currency,
      });
      if (r.reviewed_at && (r.status === "approved" || r.status === "rejected")) {
        items.push({
          id: `rv-${r.id}`,
          ts: r.reviewed_at,
          type: r.status,
          clientName: nameMap.get(r.client_id) ?? "Worker",
          amount: Number(r.total_amount),
          currency: r.currency,
        });
      }
    }

    const { data: payRows } = await supabase
      .from("report_payments")
      .select("id, submitted_report_id, amount, currency, created_at")
      .eq("recorded_by_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const reportLookup = new Map(reviewedRows.map((r) => [r.id, r.client_id]));
    for (const p of (payRows ?? []) as any[]) {
      const cid = reportLookup.get(p.submitted_report_id);
      items.push({
        id: `p-${p.id}`,
        ts: p.created_at,
        type: "payment",
        clientName: (cid && nameMap.get(cid)) || "Worker",
        amount: Number(p.amount),
        currency: p.currency,
      });
    }
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    setActivity(items.slice(0, 10));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openReport = (r: SubmittedReport) => {
    setActive(r);
    setSheetOpen(true);
  };

  return (
    <div className="pt-6 space-y-4 pb-24">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">Your dashboard.</p>
      </header>

      {/* Pending reports */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Inbox className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Pending reports</h2>
          {pending.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
              {pending.length}
            </span>
          )}
        </div>
        {loading ? (
          <Card className="p-4 text-xs text-muted-foreground text-center">Loading…</Card>
        ) : pending.length === 0 ? (
          <Card className="p-4 text-xs text-muted-foreground text-center">No reports waiting for review.</Card>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => {
              const sym = CURRENCY_SYMBOLS[r.currency] ?? "€";
              return (
                <button
                  key={r.id}
                  onClick={() => openReport(r)}
                  className="w-full text-left"
                >
                  <Card className="p-4 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{r.client_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatPeriod(r.period_start, r.period_end)} · {Number(r.total_hours).toFixed(1)}h
                        </p>
                      </div>
                      <p className="text-sm font-mono font-semibold">{sym}{Number(r.total_amount).toFixed(2)}</p>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Payments due */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Payments due</h2>
          {approved.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-foreground">
              {approved.length}
            </span>
          )}
        </div>
        {approved.length === 0 ? (
          <Card className="p-4 text-xs text-muted-foreground text-center">Approved reports awaiting payment will appear here.</Card>
        ) : (
          <div className="space-y-2">
            {approved.map((r) => {
              const sym = CURRENCY_SYMBOLS[r.currency] ?? "€";
              return (
                <button key={r.id} onClick={() => openReport(r)} className="w-full text-left">
                  <Card className="p-4 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{r.client_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatPeriod(r.period_start, r.period_end)} · approved
                        </p>
                      </div>
                      <p className="text-sm font-mono font-semibold">{sym}{Number(r.total_amount).toFixed(2)}</p>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent activity placeholder */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Recent activity</h2>
        </div>
        <Card className="p-4 text-xs text-muted-foreground text-center">
          Submissions, approvals and payments will appear here.
        </Card>
      </section>

      <SubmittedReportSheet
        open={sheetOpen}
        onOpenChange={(v) => { setSheetOpen(v); if (!v) load(); }}
        report={active}
        onReviewed={load}
      />
    </div>
  );
};

export default EmployerHomePage;
