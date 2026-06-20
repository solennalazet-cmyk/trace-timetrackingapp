import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Check, ChevronRight, Trash2, Pencil, Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import SubmittedReportSheet, { type SubmittedReport } from "@/components/SubmittedReportSheet";
import { toast } from "sonner";
import { getClientColor } from "@/lib/utils";
import Seo from "@/components/Seo";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatPeriod = (start: string, end: string) => {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${s.toLocaleDateString("en-GB", opts)} – ${e.toLocaleDateString("en-GB", opts)}`;
};

const formatDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const toLocalDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Billing cutoffs run on the 1st and 15th of each month. */
const nextBillingCutoff = (from: Date) => {
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const day = d.getDate();
  const result = new Date(d);
  if (day < 15) result.setDate(15);
  else { result.setMonth(d.getMonth() + 1, 1); }
  return result;
};

interface ReportRow extends SubmittedReport {
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
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  // Per-group payment entry state
  const [draftAmount, setDraftAmount] = useState<string>("");
  const [draftDate, setDraftDate] = useState<string>(toLocalDateKey(new Date()));
  const [editingAmount, setEditingAmount] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const col = isEmployer ? "employer_user_id" : "worker_user_id";
    // Include submitted (pending) + approved so worker can track regardless of employer action
    const { data: rRows } = await supabase
      .from("submitted_reports")
      .select("id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, status, submitted_at, reviewed_at, shared_columns, entries_snapshot, rejection_reason, rejection_note")
      .eq(col, user.id)
      .in("status", ["submitted", "approved"])
      .order("period_end", { ascending: false });

    const list = (rRows ?? []) as unknown as ReportRow[];
    setReports(list);

    if (list.length > 0) {
      const ids = list.map((r) => r.id);
      const { data: payRows } = await supabase.from("report_payments").select("*").in("submitted_report_id", ids);
      setPayments((payRows ?? []) as PaymentRow[]);

      const nameMap = new Map<string, string>();
      if (isEmployer) {
        const workerIds = Array.from(new Set(list.map((r) => r.worker_user_id)));
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", workerIds);
        const pm = new Map((profiles ?? []).map((p: any) => [p.id, (p.full_name as string) || "Freelancer"]));
        for (const id of workerIds) nameMap.set(id, pm.get(id) ?? "Freelancer");
      } else {
        const clientIds = Array.from(new Set(list.map((r) => r.client_id)));
        const { data: clientRows } = await supabase.from("clients").select("id, name").in("id", clientIds);
        const cm = new Map((clientRows ?? []).map((c: any) => [c.id, c.name as string]));
        for (const id of clientIds) nameMap.set(id, cm.get(id) ?? "Client");
      }
      setGroupNames(nameMap);
    } else {
      setPayments([]);
      setGroupNames(new Map());
    }
    setLoading(false);
  }, [user, isEmployer]);

  useEffect(() => { load(); }, [load]);

  // Scroll-based header blur (matches Reports page)
  useEffect(() => {
    const header = document.getElementById("app-header");
    if (!header) return;
    const onScroll = () => {
      if (window.scrollY > 8) {
        header.classList.add("backdrop-blur-md", "bg-background/70");
      } else {
        header.classList.remove("backdrop-blur-md", "bg-background/70");
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      header.classList.remove("backdrop-blur-md", "bg-background/70");
    };
  }, []);

  const paidByReport = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.submitted_report_id, (m.get(p.submitted_report_id) ?? 0) + Number(p.amount));
    return m;
  }, [payments]);

  // Group reports by client_id (worker view) or worker_user_id (employer view)
  const groups = useMemo(() => {
    const m = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const key = isEmployer ? r.worker_user_id : r.client_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries());
  }, [reports, isEmployer]);

  const computeGroupTotals = (rows: ReportRow[]) => {
    let due = 0, paid = 0, overdue = 0;
    let currency = "EUR";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of rows) {
      currency = r.currency;
      const total = Number(r.total_amount);
      const p = paidByReport.get(r.id) ?? 0;
      due += total;
      paid += Math.min(total, p);
      const remaining = Math.max(0, total - p);
      if (remaining > 0) {
        const ref = new Date((r.reviewed_at ?? r.submitted_at));
        const dueDate = nextBillingCutoff(ref);
        const today2 = new Date(); today2.setHours(0, 0, 0, 0);
        if (dueDate < today2) overdue += remaining;
      }
    }
    return { due, paid, outstanding: Math.max(0, due - paid), overdue, currency };
  };

  const handleExpand = (key: string, defaultOutstanding: number) => {
    const next = expandedKey === key ? null : key;
    setExpandedKey(next);
    if (next) {
      setDraftAmount(defaultOutstanding.toFixed(2));
      setDraftDate(toLocalDateKey(new Date()));
      setEditingAmount(false);
    }
  };

  const handleSavePayment = async (rows: ReportRow[]) => {
    if (!user) return;
    const amount = Number(draftAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    // Apply payment FIFO across oldest unpaid reports in group
    const sorted = [...rows].sort((a, b) => a.period_end.localeCompare(b.period_end));
    let remaining = amount;
    const inserts: any[] = [];
    for (const r of sorted) {
      if (remaining <= 0.005) break;
      const total = Number(r.total_amount);
      const paid = paidByReport.get(r.id) ?? 0;
      const owed = Math.max(0, total - paid);
      if (owed <= 0.005) continue;
      const apply = Math.min(owed, remaining);
      inserts.push({
        submitted_report_id: r.id,
        amount: apply,
        currency: r.currency,
        paid_at: draftDate,
        recorded_by_user_id: user.id,
      });
      remaining -= apply;
    }
    if (inserts.length === 0) {
      toast.info("Nothing outstanding to pay.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("report_payments").insert(inserts);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded.");
    load();
  };

  const handleDeletePayment = async (id: string) => {
    const { error } = await supabase.from("report_payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment removed.");
    load();
  };

  // Sync draft amount when underlying data changes while a group is expanded
  useEffect(() => {
    if (!expandedKey) return;
    const rows = reports.filter((r) => (isEmployer ? r.worker_user_id : r.client_id) === expandedKey);
    if (rows.length === 0) {
      setExpandedKey(null);
      return;
    }
    const t = computeGroupTotals(rows);
    setDraftAmount(t.outstanding.toFixed(2));
  }, [expandedKey, reports, payments, isEmployer]);

  return (
    <div className="pt-6 space-y-4 pb-24">
      <Seo title={"Payments — Trace"} description={"Track approved reports, outstanding invoices, and freelancer payouts in one place."} path={"/payments"} />
      <header className="space-y-1 px-1">
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          {isEmployer ? "Track what's owed and record payments." : "Track what's owed against your reports."}
        </p>
      </header>

      <div className="px-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
          BETA
          <span className="text-muted-foreground/70">Payment tracking is in beta — let us know if you spot anything off.</span>
        </span>
      </div>

      {loading ? (
        <Card className="p-4 text-xs text-muted-foreground text-center">Loading…</Card>
      ) : groups.length === 0 ? (
        <Card className="p-6 text-center">
          <Wallet className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No payment activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Submitted and approved reports will appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(([key, rows]) => {
            const t = computeGroupTotals(rows);
            const sym = CURRENCY_SYMBOLS[t.currency] ?? "€";
            const name = groupNames.get(key) ?? (isEmployer ? "Freelancer" : "Client");
            const isOpen = expandedKey === key;
            const fullyPaid = t.outstanding <= 0.005;

            const partial = t.paid > 0.005 && t.outstanding > 0.005;
            const noInvoices = t.due <= 0.005;
            const overdue = t.overdue > 0.005;

            const status = noInvoices
              ? { label: "No invoices", cls: "bg-muted text-muted-foreground" }
              : fullyPaid
                ? { label: "Paid", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" }
                : overdue
                  ? { label: "Overdue", cls: "bg-red-500/15 text-red-600 dark:text-red-400" }
                  : partial
                    ? { label: "Partial payments", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" }
                    : { label: "On track", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };

            const pct = t.due > 0 ? Math.min(100, Math.round((t.paid / t.due) * 100)) : 0;
            const barCls = noInvoices
              ? "bg-muted-foreground/20"
              : overdue
                ? "bg-red-500"
                : "bg-emerald-500";

            const initials = name
              .split(" ")
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <Card key={key} className="overflow-hidden rounded-2xl shadow-sm">
                {/* Collapsed header — always visible */}
                <button
                  type="button"
                  onClick={() => handleExpand(key, t.outstanding)}
                  className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: getClientColor(key) }}
                      aria-hidden
                    >
                      {initials || "?"}
                    </div>
                    <h2 className="text-base font-semibold flex-1 truncate">{name}</h2>
                    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${status.cls}`}>
                      {status.label}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <p className="text-base font-mono font-semibold text-foreground">{sym}{t.due.toFixed(2)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Amount Due</p>
                    </div>
                    <div>
                      <p className="text-base font-mono font-semibold text-foreground">{sym}{t.paid.toFixed(2)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Paid</p>
                    </div>
                    <div>
                      <p className={`text-base font-mono font-semibold ${
                        overdue
                          ? "text-red-600 dark:text-red-400"
                          : t.outstanding > 0.005
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-foreground"
                      }`}>
                        {sym}{t.outstanding.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Remaining</p>
                    </div>
                  </div>

                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${barCls} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>

                {/* Expanded body */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    {!fullyPaid && !noInvoices && (
                      <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-foreground" />
                          <p className="text-sm font-semibold">Record a payment</p>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={draftAmount}
                              onFocus={() => setEditingAmount(true)}
                              onChange={(e) => setDraftAmount(e.target.value)}
                              onBlur={() => setEditingAmount(false)}
                              className={`pr-9 font-mono bg-background ${editingAmount ? "" : "text-muted-foreground"}`}
                            />
                            <Pencil className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          </div>
                          <div className="flex-1 relative">
                            <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            <Input
                              type="date"
                              value={draftDate}
                              onChange={(e) => setDraftDate(e.target.value)}
                              className="pl-8 bg-background"
                            />
                          </div>
                        </div>
                        <Button
                          className="w-full rounded-lg h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm shadow-sm"
                          disabled={saving}
                          onClick={() => handleSavePayment(rows)}
                        >
                          {saving ? "Saving…" : "Confirm payment"}
                        </Button>
                      </div>
                    )}

                    {fullyPaid && !noInvoices && (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 px-1">
                        <Check className="w-4 h-4" /> Fully paid
                      </div>
                    )}


                    {/* Recent payments log */}
                    {(() => {
                      const reportIds = new Set(rows.map((r) => r.id));
                      const groupPayments = payments
                        .filter((p) => reportIds.has(p.submitted_report_id))
                        .sort((a, b) => b.paid_at.localeCompare(a.paid_at));
                      if (groupPayments.length === 0) return null;
                      return (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
                          <div className="space-y-1">
                            {groupPayments.map((p) => {
                              const s = CURRENCY_SYMBOLS[p.currency] ?? "€";
                              return (
                                <div key={p.id} className="flex items-center gap-2 text-xs py-1">
                                  <span className="text-muted-foreground w-16">{formatDate(p.paid_at)}</span>
                                  <span className="font-mono font-medium flex-1">{s}{Number(p.amount).toFixed(2)}</span>
                                  {p.recorded_by_user_id === user?.id && (
                                    <button
                                      onClick={() => handleDeletePayment(p.id)}
                                      className="text-muted-foreground hover:text-destructive"
                                      aria-label="Remove payment"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Issued reports</p>
                      <div className="space-y-1.5">
                        {rows.map((r) => {
                          const s = CURRENCY_SYMBOLS[r.currency] ?? "€";
                          const pending = r.status === "submitted";
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setOpenReportId(r.id)}
                              className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{formatPeriod(r.period_start, r.period_end)}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {pending ? "Pending approval" : "Approved"}
                                </p>
                              </div>
                              <span className="text-sm font-mono font-semibold">{s}{Number(r.total_amount).toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <SubmittedReportSheet
        report={reports.find((r) => r.id === openReportId) ?? null}
        open={!!openReportId}
        onOpenChange={(v) => { if (!v) setOpenReportId(null); }}
        readOnly
      />
    </div>
  );
};

export default PaymentsPage;
