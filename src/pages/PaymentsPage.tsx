import { useCallback, useEffect, useMemo, useState } from "react";
import { useDismissedNotifications, REJECT_ALERT_CUTOFF } from "@/hooks/useDismissedNotifications";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Check, ChevronRight, Trash2, Pencil, Calendar as CalendarIcon, Users, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import SwipeActionsRow from "@/components/SwipeActionsRow";
import RejectReportDialog from "@/components/RejectReportDialog";
import FeedbackModal from "@/components/FeedbackModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import SubmittedReportSheet, { type SubmittedReport } from "@/components/SubmittedReportSheet";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getClientColor } from "@/lib/utils";
import Seo from "@/components/Seo";
import {
  TAX_COUNTRIES, getTaxCountry, setTaxCountry, taxNoticeSeen, markTaxNoticeSeen, taxYearRange, taxQuarters,
} from "@/lib/tax-year";
import { splitPayment, countedPayments, paidMap, settledSet, owedOn, isLargeShortfall, parseAmount, type PaymentPart } from "@/lib/payment-split";
import { runExclusive } from "@/lib/action-lock";

const fmtLong = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Where a report stands, from the freelancer's point of view. */
const reportStage = (status: string, hasEmployer: boolean, paid: number, total: number, settled = false) => {
  const isPaid = settled || (total > 0 && paid + 0.005 >= total);
  if (status === "rejected") return { label: "Rejected", cls: "text-destructive" };
  if (isPaid) return { label: "Paid", cls: "text-emerald-700 dark:text-emerald-400" };
  if (paid > 0.005) return { label: "Part-paid", cls: "text-amber-700 dark:text-amber-400" };
  if (status === "pending_connection" || (status === "approved" && !hasEmployer)) return { label: "Not shared", cls: "text-muted-foreground" };
  if (status === "submitted") return { label: "Sent", cls: "text-foreground" };
  return { label: "Approved", cls: "text-foreground" };
};

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
  created_at?: string;
  legacy_shared?: boolean;
  fully_settled?: boolean;
  shortfall?: number | null;
}

interface FreelancerPaymentGroup {
  key: string;
  name: string;
}

interface PaymentsPageProps {
  embedded?: boolean;
  selectedWorker?: string | "all";
}

const PaymentsPage = ({ embedded = false, selectedWorker: selectedWorkerProp = "all" }: PaymentsPageProps = {}) => {
  const [searchParams] = useSearchParams();
  const selectedWorker = !embedded && searchParams.get("worker") ? searchParams.get("worker")! : selectedWorkerProp;
  const { user } = useAuth();
  const { activeRole } = useRole();
  const isEmployer = activeRole === "employer";
  const navigate = useNavigate();


  const [reports, setReports] = useState<ReportRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [employerFreelancers, setEmployerFreelancers] = useState<FreelancerPaymentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showPerFreelancer, setShowPerFreelancer] = useState(false);


  // Per-group payment entry state
  const [draftAmount, setDraftAmount] = useState<string>("");
  const [draftDate, setDraftDate] = useState<string>(toLocalDateKey(new Date()));
  const [editingAmount, setEditingAmount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ key: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleApproveReport = async (reportId: string) => {
    const { error } = await supabase
      .from("submitted_reports")
      .update({ status: "approved" } as any)
      .eq("id", reportId);
    if (error) { toast.error(error.message); return; }
    toast.success("Report approved.");
    load();
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const col = isEmployer ? "employer_user_id" : "worker_user_id";
    // Include submitted (pending) + approved so the report list stays visible,
    // but only approved reports are counted as wages due below.
    const reportsQuery = supabase
      .from("submitted_reports")
      .select("id, worker_user_id, employer_user_id, client_id, period_start, period_end, total_hours, total_amount, currency, status, submitted_at, reviewed_at, shared_columns, entries_snapshot, rejection_reason, rejection_note, notify_worker")
      .eq(col, user.id)
      .in("status", ["submitted", "approved", "rejected", "pending_connection"])
      .order("period_end", { ascending: false });
    // Reports the employer removed stay in the database but leave the employer's lists.
    const scopedReportsQuery = isEmployer ? reportsQuery.is("employer_hidden_at", null) : reportsQuery;

    const freelancersQuery = isEmployer
      ? supabase
          .from("clients")
          .select("id, connected_user_id, name")
          .eq("user_id", user.id)
          .in("kind", ["contractor", "both"])
          .order("name", { ascending: true })
      : null;

    const [reportsRes, freelancersRes] = await Promise.all([
      scopedReportsQuery,
      freelancersQuery ?? Promise.resolve({ data: null }),
    ]);

    const list = (reportsRes.data ?? []) as unknown as ReportRow[];
    setReports(list);

    const nameMap = new Map<string, string>();
    if (isEmployer) {
      const freelancerGroups = ((freelancersRes.data ?? []) as any[]).map((row) => ({
        key: row.connected_user_id ?? row.id,
        name: row.name as string,
      }));
      setEmployerFreelancers(freelancerGroups);
      for (const freelancer of freelancerGroups) {
        nameMap.set(freelancer.key, freelancer.name);
      }
      for (const workerId of Array.from(new Set(list.map((r) => r.worker_user_id))).filter(Boolean)) {
        if (!nameMap.has(workerId)) nameMap.set(workerId, "Freelancer");
      }
    } else {
      setEmployerFreelancers([]);
    }

    if (list.length > 0) {
      const ids = list.map((r) => r.id);
      const { data: payRows } = await supabase.from("report_payments").select("*").in("submitted_report_id", ids);
      setPayments((payRows ?? []) as PaymentRow[]);

      if (!isEmployer) {
        const clientIds = Array.from(new Set(list.map((r) => r.client_id)));
        const { data: clientRows } = await supabase.from("clients").select("id, name").in("id", clientIds);
        const cm = new Map((clientRows ?? []).map((c: any) => [c.id, c.name as string]));
        for (const id of clientIds) nameMap.set(id, cm.get(id) ?? "Client");
      }
    } else {
      setPayments([]);
    }
    setGroupNames(nameMap);
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

  // The database returns only this person's own payments plus legacy shared
  // ones. A freelancer's own new receipt replaces a legacy row on the same report.
  const counted = useMemo(() => countedPayments(payments, reports), [payments, reports]);
  const paidByReport = useMemo(() => paidMap(counted), [counted]);
  const settled = useMemo(() => settledSet(counted), [counted]);

  const visibleReports = useMemo(() => {
    if (!isEmployer || selectedWorker === "all") return reports;
    return reports.filter((r) => r.worker_user_id === selectedWorker);
  }, [reports, isEmployer, selectedWorker]);

  // Group reports by client_id (worker view) or worker_user_id (employer view)
  const groups = useMemo(() => {
    const m = new Map<string, ReportRow[]>();
    if (isEmployer) {
      for (const freelancer of employerFreelancers) {
        if (!m.has(freelancer.key)) m.set(freelancer.key, []);
      }
    }
    for (const r of visibleReports) {
      const key = isEmployer ? r.worker_user_id : r.client_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => {
      const an = groupNames.get(a[0]) ?? "";
      const bn = groupNames.get(b[0]) ?? "";
      return an.localeCompare(bn);
    });
  }, [visibleReports, isEmployer, employerFreelancers, groupNames]);

  const filteredGroups = useMemo(() => {
    if (!isEmployer || selectedWorker === "all") return groups;
    return groups.filter(([key]) => key === selectedWorker);
  }, [groups, isEmployer, selectedWorker]);

  const selectedWorkerName = useMemo(() => {
    if (!isEmployer) return "Overview";
    if (selectedWorker === "all") return "All freelancers";
    return groupNames.get(selectedWorker) ?? employerFreelancers.find((f) => f.key === selectedWorker)?.name ?? "Freelancer";
  }, [isEmployer, selectedWorker, groupNames, employerFreelancers]);


  // A report counts as owed from the moment it is sent. Rejected reports are
  // excluded (they need fixing and re-sending); payments reduce what is owed.
  const computeGroupTotals = (rows: ReportRow[]) => {
    let due = 0, paid = 0, overdue = 0, outstanding = 0;
    let currency = "EUR";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of rows) {
      if (r.status === "rejected") continue;
      currency = r.currency;
      const total = Number(r.total_amount);
      const p = Math.min(total, paidByReport.get(r.id) ?? 0);
      const remaining = owedOn(r, paidByReport, settled);
      due += total;
      paid += p;
      outstanding += remaining; // settled reports owe nothing more
      if (remaining > 0.005 && r.status === "approved" && r.employer_user_id) {
        const ref = new Date((r.reviewed_at ?? r.submitted_at));
        if (nextBillingCutoff(ref) < today) overdue += remaining;
      }
    }
    return { due, paid, outstanding: Math.max(0, outstanding), overdue, currency };
  };

  const overallTotals = useMemo(() => computeGroupTotals(visibleReports), [visibleReports, paidByReport]);
  // Actionable rejection alerts (freelancer only): only reviews after this
  // feature shipped, only when the employer chose to notify, not dismissed.
  const { dismissed: dismissedRejects, loaded: dismissLoaded, dismiss } = useDismissedNotifications();
  const rejectAlerts = useMemo(() => {
    if (isEmployer || !dismissLoaded) return [];
    return visibleReports.filter((r: any) =>
      r.status === "rejected" &&
      r.notify_worker !== false &&
      r.reviewed_at && Date.parse(r.reviewed_at) >= REJECT_ALERT_CUTOFF &&
      !dismissedRejects.includes(r.id),
    );
  }, [visibleReports, dismissedRejects, isEmployer, dismissLoaded]);
  const dismissReject = (id: string) => { void dismiss([id]); };
  const resendReport = (r: ReportRow) => {
    const q = new URLSearchParams({ resend_from: r.period_start, resend_to: r.period_end, resend_client: r.client_id });
    navigate(`/reports?${q.toString()}`);
  };

  // "Paid" total is scoped to a date range — the tax year by default.
  const [taxInfo, setTaxInfo] = useState(() => getTaxCountry());
  const [paidRange, setPaidRange] = useState<{ start: string; end: string; label: string }>(() => {
    const r = taxYearRange(getTaxCountry().country);
    return { ...r, label: "This tax year" };
  });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [showTaxNotice, setShowTaxNotice] = useState(() => getTaxCountry().assumed && !taxNoticeSeen());

  const visibleReportIds = useMemo(() => new Set(visibleReports.map((r) => r.id)), [visibleReports]);
  const paidBetween = useCallback((start: string, end: string) => {
    let sum = 0;
    for (const p of counted) {
      if (!visibleReportIds.has(p.submitted_report_id)) continue;
      if (p.paid_at >= start && p.paid_at <= end) sum += Number(p.amount);
    }
    return sum;
  }, [counted, visibleReportIds]);
  const paidInRange = paidBetween(paidRange.start, paidRange.end);

  const changeTaxCountry = (code: string) => {
    setTaxCountry(code);
    const next = getTaxCountry();
    setTaxInfo(next);
    setShowTaxNotice(false);
    setPaidRange({ ...taxYearRange(next.country), label: "This tax year" });
  };

  // Collapse any open card when the worker filter changes so a hidden group doesn't stay open.
  useEffect(() => {
    setExpandedKey(null);
  }, [selectedWorker]);


  const handleExpand = (key: string, defaultOutstanding: number) => {
    const next = expandedKey === key ? null : key;
    setExpandedKey(next);
    if (next) {
      setDraftAmount(defaultOutstanding.toFixed(2));
      setDraftDate(toLocalDateKey(new Date()));
      setEditingAmount(false);
    }
  };

  // Who is recording: the report's freelancer records what arrived (may differ
  // from the invoice); the employer may not pay more than is owed.
  const [draftSettled, setDraftSettled] = useState(false);
  const [settleConfirm, setSettleConfirm] = useState<{ rows: ReportRow[]; parts: PaymentPart[]; shortfall: number; owedReached: number; currency: string } | null>(null);

  const insertParts = async (rows: ReportRow[], parts: PaymentPart[], settledTick: boolean, shortfall: number) => {
    if (!user || saving) return;
    const inserts = parts.map((p, i) => ({
      submitted_report_id: p.reportId,
      amount: p.amount,
      currency: p.currency,
      paid_at: draftDate,
      recorded_by_user_id: user.id,
      ...(settledTick ? { fully_settled: true, shortfall: i === parts.length - 1 && shortfall > 0 ? shortfall : null } : {}),
    }));
    setSaving(true);
    const total = parts.reduce((s, p) => s + p.amount, 0);
    const { error } = await runExclusive(
      `payment:${rows.map((r) => r.id).sort().join(",")}:${total.toFixed(2)}:${draftDate}`,
      async () => await supabase.from("report_payments").insert(inserts as any),
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(settledTick ? "Receipt recorded and marked settled." : "Payment recorded.");
    setDraftSettled(false);
    load();
  };

  const handleSavePayment = async (rows: ReportRow[]) => {
    if (!user || saving) return;
    const isReceipt = rows.length > 0 && rows[0].worker_user_id === user.id;
    const result = splitPayment(draftAmount, rows, paidByReport, { allowOver: isReceipt, settled });
    if (!result.ok) { toast.error((result as { message: string }).message); return; }
    if (isReceipt && result.over > 0.005) {
      toast.info(`That's ${result.over.toFixed(2)} more than invoiced. It's been added to the latest report.`);
    }
    if (isReceipt && draftSettled) {
      setSettleConfirm({ rows, parts: result.parts, shortfall: result.shortfall, owedReached: result.owedReached, currency: rows[0].currency });
      return;
    }
    await insertParts(rows, result.parts, false, 0);
  };

  const handleDeletePayment = async (ids: string | string[]) => {
    const list = Array.isArray(ids) ? ids : [ids];
    const { error } = await supabase.from("report_payments").delete().in("id", list);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment removed.");
    load();
  };

  /** Reports the current person may remove from this group. */
  const removableRows = (rows: ReportRow[]) => {
    if (!user) return [];
    return rows.filter((r) =>
      r.worker_user_id === user.id
        // Freelancer: approved reports sent to an employer are locked.
        ? !(r.employer_user_id && r.status === "approved")
        // Employer: only reviewed reports; pending ones are rejected instead.
        : r.status === "approved" || r.status === "rejected",
    );
  };

  const handleDeleteGroup = async () => {
    if (!deleteTarget || !user || deleting) return;
    const groupRows = reports.filter((r) => (isEmployer ? r.worker_user_id : r.client_id) === deleteTarget.key);
    const targets = removableRows(groupRows);
    if (targets.length === 0) { setDeleteTarget(null); return; }
    setDeleting(true);
    let removed = 0;
    let firstError: string | null = null;
    for (const r of targets) {
      // Employer "Remove" only hides the report from their own lists; it never
      // deletes reports or payments. Freelancer delete removes their own report
      // (and their own payments with it); the database refuses anything else.
      const { error } = r.worker_user_id === user.id
        ? await supabase.from("submitted_reports").delete().eq("id", r.id)
        : await supabase.from("submitted_reports").update({ employer_hidden_at: new Date().toISOString() } as any).eq("id", r.id);
      if (error) firstError = firstError ?? error.message; else removed++;
    }
    setDeleting(false);
    const kept = groupRows.length - removed;
    if (removed === 0) toast.error(firstError ?? "Nothing could be removed.");
    else toast.success(kept > 0 ? `Removed ${removed}. ${kept} kept (locked or awaiting review).` : "Removed.");
    if (expandedKey === deleteTarget.key) setExpandedKey(null);
    setDeleteTarget(null);
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
    <div className={embedded ? "space-y-4" : "pt-6 space-y-4 pb-24"}>
      {!embedded && (
        <>
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
              <span className="text-muted-foreground/70">
                Payment tracking is in beta —{" "}
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="underline underline-offset-2 font-semibold text-foreground"
                >
                  let us know
                </button>{" "}
                if you spot anything off.
              </span>
            </span>
          </div>
        </>
      )}

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
          {(() => {
            const totalSym = CURRENCY_SYMBOLS[overallTotals.currency] ?? "€";
            const allPaid = overallTotals.outstanding <= 0.005;
            const quarters = taxQuarters(taxYearRange(taxInfo.country));
            const lastYear = taxYearRange(taxInfo.country, -1);
            const presets = [
              { ...taxYearRange(taxInfo.country), label: "This tax year" },
              { ...lastYear, label: "Last tax year" },
              { start: "2000-01-01", end: "2999-12-31", label: "All time" },
            ];
            return (
              <Card className="p-4 rounded-2xl shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Due today</span>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground shrink-0">
                    {selectedWorkerName}
                  </span>
                </div>
                {allPaid ? (
                  <div className="flex items-center gap-2">
                    <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-3xl font-bold tracking-tight">All paid up</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-4xl font-mono font-bold text-foreground">{totalSym}{overallTotals.outstanding.toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Sent but not yet marked paid
                      {overallTotals.overdue > 0.005 && (
                        <span className="text-destructive font-medium"> · {totalSym}{overallTotals.overdue.toFixed(2)} overdue</span>
                      )}
                    </p>
                  </div>
                )}
                {rejectAlerts.length > 0 && (
                  <div className="space-y-2">
                    {rejectAlerts.map((r) => (
                      <div key={r.id} className="rounded-xl border border-destructive/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-destructive font-medium">
                            {groupNames.get(r.client_id) ?? "Client"} rejected your report ({r.period_start} → {r.period_end})
                          </p>
                          <button
                            type="button"
                            aria-label="Dismiss"
                            className="text-muted-foreground hover:text-foreground -m-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            onClick={() => dismissReject(r.id)}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <Button size="sm" className="rounded-full h-8 px-4 mt-2" onClick={() => resendReport(r)}>
                          Fix &amp; resend
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setRangeOpen((v) => !v)}
                  aria-expanded={rangeOpen}
                  className="w-full flex items-center justify-between gap-2 min-h-[44px] pt-3 border-t border-border text-left"
                >
                  <span className="text-sm text-muted-foreground">
                    Paid <span className="font-mono font-semibold text-foreground">{totalSym}{paidInRange.toFixed(2)}</span>
                    {paidRange.label === "All time" ? " · all time" : <> since <span className="underline underline-offset-2 text-foreground">{fmtLong(paidRange.start)}</span></>}
                  </span>
                  <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>

                {showTaxNotice && (
                  <div className="rounded-xl bg-muted p-3 text-sm space-y-2">
                    <p>
                      We assumed you pay tax in <strong>{taxInfo.country.name}</strong>, with the tax year starting{" "}
                      {new Date(2000, taxInfo.country.month - 1, taxInfo.country.day).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-10" onClick={() => { setRangeOpen(true); markTaxNoticeSeen(); setShowTaxNotice(false); }}>Change</Button>
                      <Button size="sm" className="h-10" onClick={() => { markTaxNoticeSeen(); setShowTaxNotice(false); }}>That's right</Button>
                    </div>
                  </div>
                )}

                {rangeOpen && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {presets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setPaidRange(p)}
                          className={`px-3 min-h-[40px] rounded-full text-sm font-medium border ${paidRange.label === p.label ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border"}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {quarters.map((q) => {
                        const active = paidRange.start === q.start && paidRange.end === q.end;
                        return (
                          <button
                            key={q.label}
                            type="button"
                            onClick={() => setPaidRange({ ...q, label: q.label })}
                            className={`rounded-xl border p-2 text-left ${active ? "border-foreground bg-muted" : "border-border"}`}
                          >
                            <p className="text-xs text-muted-foreground">{q.label} · {formatDate(q.start)}</p>
                            <p className="text-sm font-mono font-semibold">{totalSym}{paidBetween(q.start, q.end).toFixed(0)}</p>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Input type="date" value={paidRange.start} onChange={(e) => e.target.value && setPaidRange((r) => ({ ...r, start: e.target.value, label: "Custom" }))} className="bg-background min-w-0 flex-1" aria-label="From" />
                      <Input type="date" value={paidRange.end} onChange={(e) => e.target.value && setPaidRange((r) => ({ ...r, end: e.target.value, label: "Custom" }))} className="bg-background min-w-0 flex-1" aria-label="To" />
                    </div>
                    <label className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Tax country</span>
                      <select
                        value={taxInfo.country.code}
                        onChange={(e) => changeTaxCountry(e.target.value)}
                        className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
                      >
                        {TAX_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </Card>
            );
          })()}

          {isEmployer && selectedWorker === "all" && (
            <button
              type="button"
              onClick={() => setShowPerFreelancer((v) => !v)}
              aria-expanded={showPerFreelancer}
              className="w-full flex items-center gap-3 min-h-[56px] px-4 py-3 rounded-2xl border border-border bg-card shadow-sm text-left active:bg-muted/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold tracking-tight">Per freelancer</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {showPerFreelancer ? "Tap to hide the breakdown" : "Tap to see who is owed what"}
                </p>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                {filteredGroups.filter(([, rows]) => rows.length > 0).length}
              </span>
              <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${showPerFreelancer ? "rotate-90" : ""}`} />
            </button>
          )}

          {(() => {
            // In employer "All freelancers" view, hide freelancers with no
            // current activity (no reports of any status in the visible set).
            // They reappear automatically the moment a report is submitted,
            // approved, or paid. A "Show inactive" toggle reveals the rest
            // without ever deleting them.
            const splittable = isEmployer && selectedWorker === "all";
            if (splittable && !showPerFreelancer) return null;
            const activeGroups = splittable ? filteredGroups.filter(([, rows]) => rows.length > 0) : filteredGroups;
            const inactiveGroups = splittable ? filteredGroups.filter(([, rows]) => rows.length === 0) : [];
            const visibleGroups = showInactive ? [...activeGroups, ...inactiveGroups] : activeGroups;
            return <>

          {visibleGroups.map(([key, rows]) => {
            const t = computeGroupTotals(rows);
            const sym = CURRENCY_SYMBOLS[t.currency] ?? "€";
            const name = groupNames.get(key) ?? (isEmployer ? "Freelancer" : "Client");
            const isOpen = expandedKey === key;
            const fullyPaid = t.outstanding <= 0.005;

            const noInvoices = t.due <= 0.005;
            const overdue = t.overdue > 0.005;

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

            const paymentCard = (
              <Card className="overflow-hidden rounded-2xl shadow-sm">
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
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <p className="text-base font-mono font-semibold text-foreground">{sym}{t.due.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Billed</p>
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
                      <p className="text-xs text-muted-foreground mt-0.5">Due</p>
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
                              type="text"
                              inputMode="decimal"
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
                        {rows[0]?.worker_user_id === user?.id && (
                          <label className="flex items-start gap-2 text-sm min-h-[44px] cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={draftSettled}
                              onChange={(e) => setDraftSettled(e.target.checked)}
                            />
                            <span>
                              Fully settled
                              <span className="block text-xs text-muted-foreground">Tick if this is all you'll receive (e.g. bank fees were taken). Only you see this.</span>
                            </span>
                          </label>
                        )}
                        {rows[0]?.worker_user_id === user?.id && (() => {
                          const typed = parseAmount(draftAmount);
                          return Number.isFinite(typed) && typed > t.outstanding + 0.01 ? (
                            <p className="text-xs text-muted-foreground">That's more than the {sym}{t.outstanding.toFixed(2)} invoiced. That's fine if it's what arrived.</p>
                          ) : null;
                        })()}
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


                    {/* Payments as registered: one line per time a payment was recorded */}
                    {(() => {
                      const reportIds = new Set(rows.map((r) => r.id));
                      const groupPayments = payments.filter((p) => reportIds.has(p.submitted_report_id));
                      if (groupPayments.length === 0) return null;
                      // One recorded payment can be split across several reports —
                      // group them back into the single entry the user registered.
                      const byRegistration = new Map<string, { ids: string[]; amount: number; currency: string; paidAt: string; mine: boolean }>();
                      for (const p of groupPayments) {
                        const k = `${p.paid_at}|${(p.created_at ?? "").slice(0, 19)}`;
                        const g = byRegistration.get(k) ?? { ids: [], amount: 0, currency: p.currency, paidAt: p.paid_at, mine: true };
                        g.ids.push(p.id);
                        g.amount += Number(p.amount);
                        g.mine = g.mine && p.recorded_by_user_id === user?.id;
                        byRegistration.set(k, g);
                      }
                      const entries = Array.from(byRegistration.values()).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
                      return (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
                          <div className="space-y-1">
                            {entries.map((e) => {
                              const s = CURRENCY_SYMBOLS[e.currency] ?? "€";
                              return (
                                <div key={e.ids.join("-")} className="flex items-center gap-2 text-sm py-1">
                                  <span className="text-muted-foreground w-20">{formatDate(e.paidAt)}</span>
                                  <span className="font-mono font-medium flex-1">{s}{e.amount.toFixed(2)}</span>
                                  {e.mine && (
                                    <button
                                      onClick={() => handleDeletePayment(e.ids)}
                                      className="text-muted-foreground hover:text-destructive"
                                      aria-label="Remove payment"
                                    >
                                      <Trash2 className="w-4 h-4" />
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
                          const total = Number(r.total_amount);
                          const reportPaid = Math.min(total, paidByReport.get(r.id) ?? 0);
                          const stage = reportStage(r.status, !!r.employer_user_id, reportPaid, total, settled.has(r.id));
                          const payLabel = stage.label === "Part-paid"
                            ? `Part-paid · ${s}${(total - reportPaid).toFixed(2)} due`
                            : stage.label;
                          const row = (
                            <button
                              type="button"
                              onClick={() => setOpenReportId(r.id)}
                              className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{formatPeriod(r.period_start, r.period_end)}</p>
                                <p className={`text-xs mt-0.5 font-medium ${stage.cls}`}>
                                  {payLabel}
                                </p>
                              </div>
                              <span className="text-sm font-mono font-semibold">{s}{Number(r.total_amount).toFixed(2)}</span>
                            </button>
                          );
                          if (!isEmployer || !pending) return <div key={r.id}>{row}</div>;
                          return (
                            <SwipeActionsRow
                              key={r.id}
                              actionWidth={76}
                              actions={[
                                { label: "Reject", Icon: X, onAction: () => setRejectId(r.id), className: "bg-destructive text-destructive-foreground" },
                                { label: "Approve", Icon: Check, onAction: () => handleApproveReport(r.id), className: "bg-emerald-600 text-white" },
                              ]}
                            >
                              {row}
                            </SwipeActionsRow>
                          );
                        })}
                      </div>
                    </div>

                    {!embedded && removableRows(rows).length > 0 && (
                      <Button
                        variant="outline"
                        className="w-full rounded-lg h-10 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget({ key, name })}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );

            return <div key={key}>{paymentCard}</div>;
          })}
          {splittable && inactiveGroups.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="w-full text-center text-[11px] font-medium text-muted-foreground hover:text-foreground py-2 transition-colors"
            >
              {showInactive ? `Hide inactive (${inactiveGroups.length})` : `Show inactive (${inactiveGroups.length})`}
            </button>
          )}
            </>;
          })()}
        </div>
      )}

      <SubmittedReportSheet
        report={reports.find((r) => r.id === openReportId) ?? null}
        open={!!openReportId}
        onOpenChange={(v) => { if (!v) setOpenReportId(null); }}
        readOnly
      />

      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      <RejectReportDialog
        open={rejectId !== null}
        onOpenChange={(v) => { if (!v) setRejectId(null); }}
        reportId={rejectId}
        onRejected={load}
      />

      {!embedded && <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isEmployer
                ? "Approved and rejected reports from this freelancer will be removed from your lists. Nothing is deleted, and the freelancer's records don't change. Reports still awaiting review stay: reject them instead."
                : "Your reports for this client will be permanently deleted, with the payments you recorded on them. Approved reports sent to a client are locked and will be kept. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing…" : isEmployer ? "Remove" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}

      <AlertDialog open={!!settleConfirm} onOpenChange={(o) => !o && setSettleConfirm(null)}>
        <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as settled?</AlertDialogTitle>
            <AlertDialogDescription>
              {settleConfirm && (() => {
                const s = CURRENCY_SYMBOLS[settleConfirm.currency] ?? "€";
                const n = settleConfirm.parts.length;
                return (
                  <>
                    This will mark {n} report{n === 1 ? "" : "s"} as settled, with a shortfall of {s}{settleConfirm.shortfall.toFixed(2)}.
                    {isLargeShortfall(settleConfirm.shortfall, settleConfirm.owedReached) && (
                      <span className="block mt-2 font-semibold text-destructive">
                        That's more than 10% of the {s}{settleConfirm.owedReached.toFixed(2)} invoiced. Check the amount before you confirm.
                      </span>
                    )}
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                const c = settleConfirm;
                setSettleConfirm(null);
                if (c) void insertParts(c.rows, c.parts, true, c.shortfall);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PaymentsPage;
