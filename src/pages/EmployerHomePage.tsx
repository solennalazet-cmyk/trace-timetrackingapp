import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Inbox, Wallet, Activity, ChevronRight, Check, X, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import SubmittedReportSheet, { type SubmittedReport } from "@/components/SubmittedReportSheet";
import RejectReportDialog from "@/components/RejectReportDialog";
import Seo from "@/components/Seo";
import EmployerDashboardSection from "@/components/EmployerDashboardSection";
import ConnectionInvitesCard from "@/components/ConnectionInvitesCard";

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

const PULL_THRESHOLD = 70;

const EmployerHomePage = () => {
  const { user } = useAuth();
  const [pending, setPending] = useState<SubmittedReport[]>([]);
  const [approved, setApproved] = useState<SubmittedReport[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SubmittedReport | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [view, setView] = useState<"status" | "dashboard">("dashboard");

  // Pull-to-refresh state
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);

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
    const workerIds = Array.from(new Set(allRows.map((r) => r.worker_user_id))).filter(Boolean);
    let clientNameMap = new Map<string, string>();
    let workerNameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      clientNameMap = new Map((clientRows ?? []).map((c: any) => [c.id, c.name]));
    }
    if (workerIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", workerIds as string[]);
      workerNameMap = new Map(
        (profileRows ?? [])
          .filter((p: any) => p.full_name && p.full_name.trim())
          .map((p: any) => [p.id, p.full_name.trim()]),
      );
    }
    const resolveName = (r: any) =>
      workerNameMap.get(r.worker_user_id) ?? clientNameMap.get(r.client_id) ?? "Freelancer";
    const mapRow = (r: any): SubmittedReport => ({ ...r, client_name: resolveName(r) });
    setPending(((pRes.data ?? []) as any[]).map(mapRow));
    setApproved(((aRes.data ?? []) as any[]).map(mapRow));

    const items: ActivityItem[] = [];
    for (const r of reviewedRows) {
      const nm = resolveName(r);
      items.push({
        id: `s-${r.id}`,
        ts: r.submitted_at,
        type: "submitted",
        clientName: nm,
        amount: Number(r.total_amount),
        currency: r.currency,
      });
      if (r.reviewed_at && (r.status === "approved" || r.status === "rejected")) {
        items.push({
          id: `rv-${r.id}`,
          ts: r.reviewed_at,
          type: r.status,
          clientName: nm,
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
    const reportRowLookup = new Map(reviewedRows.map((r) => [r.id, r]));
    for (const p of (payRows ?? []) as any[]) {
      const reportRow = reportRowLookup.get(p.submitted_report_id);
      items.push({
        id: `p-${p.id}`,
        ts: p.created_at,
        type: "payment",
        clientName: reportRow ? resolveName(reportRow) : "Freelancer",
        amount: Number(p.amount),
        currency: p.currency,
      });
    }
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    setActivity(items.slice(0, 10));

    setLoading(false);
    window.dispatchEvent(new Event("pending-reports-changed"));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openReport = (r: SubmittedReport) => {
    setActive(r);
    setSheetOpen(true);
  };

  const handleQuickApprove = async (r: SubmittedReport, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingId(r.id);
    const { error } = await supabase
      .from("submitted_reports")
      .update({ status: "approved" } as any)
      .eq("id", r.id);
    setApprovingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Approved ${r.client_name}'s report.`);
    load();
  };

  // Pull-to-refresh handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0) return;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null || refreshing) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0 && window.scrollY <= 0) {
      setPullY(Math.min(delta * 0.5, 100));
    }
  };
  const onTouchEnd = async () => {
    if (touchStartY.current == null) return;
    touchStartY.current = null;
    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(50);
      await load();
      setRefreshing(false);
    }
    setPullY(0);
  };

  return (
    <div
      className="pt-6 space-y-4 pb-24"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: pullY ? `translateY(${pullY}px)` : undefined, transition: refreshing || touchStartY.current === null ? "transform 200ms ease" : undefined }}
    >
      {(pullY > 0 || refreshing) && (
        <div className="flex justify-center -mt-4 mb-1" aria-hidden>
          <Loader2 className={`w-4 h-4 text-muted-foreground ${refreshing || pullY >= PULL_THRESHOLD ? "animate-spin" : ""}`} style={{ opacity: Math.min(pullY / PULL_THRESHOLD, 1) }} />
        </div>
      )}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {view === "status" ? "What needs your attention right now." : "Wages and break patterns across a date range."}
        </p>
      </header>

      {/* View toggle — pill segmented control, distinct from content cards below */}
      <div role="tablist" aria-label="Overview view" className="inline-flex w-full p-1 rounded-full bg-foreground/5 border border-border/40">
        <button
          role="tab"
          aria-selected={view === "dashboard"}
          onClick={() => setView("dashboard")}
          className={`flex-1 h-9 rounded-full text-xs font-semibold transition-colors ${view === "dashboard" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Dashboard
        </button>
        <button
          role="tab"
          aria-selected={view === "status"}
          onClick={() => setView("status")}
          className={`flex-1 h-9 rounded-full text-xs font-semibold transition-colors ${view === "status" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Status to date
        </button>
      </div>

      {view === "dashboard" && (
        <>
          <ConnectionInvitesCard />
          <EmployerDashboardSection refreshKey={refreshing ? 1 : 0} breaksDefaultOpen />
        </>
      )}

      {view === "status" && (
        <>


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
              const isApproving = approvingId === r.id;
              return (
                <Card key={r.id} className="overflow-hidden">
                  <Seo title={"Team Dashboard — Trace for Employers"} description={"Approve freelancer time reports, review payments, and monitor team activity at a glance."} path={"/employer"} />
                  <button
                    onClick={() => openReport(r)}
                    className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
                  >
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
                  </button>
                  <div className="grid grid-cols-2 border-t border-border">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRejectId(r.id); }}
                      disabled={isApproving}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors border-r border-border disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={(e) => handleQuickApprove(r, e)}
                      disabled={isApproving}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {isApproving ? "Approving…" : "Approve"}
                    </button>
                  </div>
                </Card>
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

      {/* Recent activity */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Recent activity</h2>
        </div>
        {activity.length === 0 ? (
          <Card className="p-4 text-xs text-muted-foreground text-center">
            Submissions, approvals and payments will appear here.
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {activity.map((a) => {
              const sym = CURRENCY_SYMBOLS[a.currency ?? "EUR"] ?? "€";
              const meta = (() => {
                switch (a.type) {
                  case "submitted": return { Icon: FileText, label: `${a.clientName} submitted a report` };
                  case "approved": return { Icon: Check, label: `You approved ${a.clientName}'s report` };
                  case "rejected": return { Icon: X, label: `You rejected ${a.clientName}'s report` };
                  case "payment": return { Icon: Wallet, label: `Payment recorded for ${a.clientName}` };
                }
              })();
              const Icon = meta.Icon;
              return (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelative(a.ts)}</p>
                  </div>
                  {a.amount != null && (
                    <p className="text-xs font-mono font-semibold">{sym}{a.amount.toFixed(2)}</p>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>
        </>
      )}



      <SubmittedReportSheet
        open={sheetOpen}
        onOpenChange={(v) => { setSheetOpen(v); if (!v) load(); }}
        report={active}
        onReviewed={load}
      />

      <RejectReportDialog
        open={rejectId !== null}
        onOpenChange={(v) => { if (!v) setRejectId(null); }}
        reportId={rejectId}
        onRejected={load}
      />
    </div>
  );
};

export default EmployerHomePage;
