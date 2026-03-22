import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, CartesianGrid,
} from "recharts";
import {
  ChevronDown, ChevronUp, Timer, PenLine, Clock, Phone, ChevronRight, Crown,
  CreditCard, Download, Trash2, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import EntryDetailSheet, { type TimeEntry } from "@/components/EntryDetailSheet";
import AssignmentModal, { type SessionData, type AssignmentResult, type ExistingEntry } from "@/components/AssignmentModal";
import BillingDialog from "@/components/BillingDialog";
import PaywallModal from "@/components/PaywallModal";
import ClientBillingSummary from "@/components/ClientBillingSummary";
import UnassignedPanel from "@/components/UnassignedPanel";
import { toast } from "sonner";

type DateRange = "today" | "7days" | "30days" | "month";

const RANGES: { key: DateRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7days", label: "7 days" },
  { key: "30days", label: "30 days" },
  { key: "month", label: "This month" },
];

const CLIENT_COLORS = [
  "hsl(45 93% 58%)", "hsl(200 80% 55%)", "hsl(340 75% 55%)", "hsl(150 60% 45%)",
  "hsl(270 60% 60%)", "hsl(25 90% 55%)", "hsl(180 50% 45%)", "hsl(0 70% 55%)",
];

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const getDateRangeStart = (range: DateRange): string => {
  const now = new Date();
  let d: Date;
  switch (range) {
    case "today": d = now; break;
    case "7days": d = new Date(now.getTime() - 6 * 86400000); break;
    case "30days": d = new Date(now.getTime() - 29 * 86400000); break;
    case "month": d = new Date(now.getFullYear(), now.getMonth(), 1); break;
  }
  return d.toISOString().split("T")[0];
};

const getDaysInRange = (startStr: string): string[] => {
  const days: string[] = [];
  const start = new Date(startStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let d = new Date(start);
  while (d <= today) {
    days.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
};

const entryTypeIcon = (type: string | null) => {
  switch (type) {
    case "manual": return <PenLine className="w-4 h-4 text-muted-foreground" />;
    case "shift": return <Clock className="w-4 h-4 text-muted-foreground" />;
    case "call": return <Phone className="w-4 h-4 text-muted-foreground" />;
    default: return <Timer className="w-4 h-4 text-muted-foreground" />;
  }
};

type EntryTypeFilter = "all" | "timer" | "manual" | "shift" | "call";
type BillableFilter = "all" | "billable" | "non-billable";

const ReportsPage = () => {
  const { user, profile } = useAuth();
  const isFree = profile?.plan === "free";
  const isPro = profile?.plan === "pro" || profile?.plan === "trial";

  const [range, setRange] = useState<DateRange>("7days");
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [rangeEntries, setRangeEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [projects, setProjectsMap] = useState<Record<string, string>>({});
  const [tasks, setTasksMap] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail/edit
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ExistingEntry | null>(null);
  const [editSession, setEditSession] = useState<SessionData | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingClientId, setBillingClientId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(false);

  // Recent activity filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>("all");
  const [billableFilter, setBillableFilter] = useState<BillableFilter>("all");
  const [clientFilter, setClientFilter] = useState("");
  const [showRecentActivity, setShowRecentActivity] = useState(true);
  const [showCharts, setShowCharts] = useState(true);

  const today = new Date().toISOString().split("T")[0];
  const rangeStart = getDateRangeStart(range);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (user) {
      const [{ data: te }, { data: re }, { data: c }, { data: p }, { data: t }, { data: inv }] = await Promise.all([
        supabase.from("time_entries").select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, billable_value, client_id, project_id, task_id, billing_status")
          .eq("user_id", user.id).eq("entry_date", today).is("deleted_at", null),
        supabase.from("time_entries").select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, billable_value, client_id, project_id, task_id, billing_status")
          .eq("user_id", user.id).gte("entry_date", rangeStart).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("clients").select("id, name").eq("user_id", user.id),
        supabase.from("projects").select("id, name").eq("user_id", user.id),
        supabase.from("tasks").select("id, name").eq("user_id", user.id),
        supabase.from("invoices").select("id, client_id, total_amount, currency, date_range_start, date_range_end, status, sent_at, paid_at, created_at")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      ]);

      const cm: Record<string, string> = {}; c?.forEach((x) => { cm[x.id] = x.name; });
      const pm: Record<string, string> = {}; p?.forEach((x) => { pm[x.id] = x.name; });
      const tm: Record<string, string> = {}; t?.forEach((x) => { tm[x.id] = x.name; });
      setClients(cm); setProjectsMap(pm); setTasksMap(tm);

      const enrich = (entries: any[]) => entries.map((e: any) => ({
        ...e,
        client_name: e.client_id ? cm[e.client_id] : undefined,
        project_name: e.project_id ? pm[e.project_id] : undefined,
        task_name: e.task_id ? tm[e.task_id] : undefined,
      }));

      setTodayEntries(enrich(te ?? []) as TimeEntry[]);
      setRangeEntries(enrich(re ?? []) as TimeEntry[]);
      setInvoices(inv ?? []);
    } else {
      const all = getAnonymousEntries();
      const todayE = all.filter((e: any) => e.entry_date === today).map((e: any, i: number) => ({ ...e, id: e.id ?? `anon-${i}` }));
      const rangeE = all.filter((e: any) => (e.entry_date ?? "") >= rangeStart).map((e: any, i: number) => ({ ...e, id: e.id ?? `anon-r-${i}` }));
      setTodayEntries(todayE); setRangeEntries(rangeE);
      setClients({}); setProjectsMap({}); setTasksMap({}); setInvoices([]);
    }
    setLoading(false);
  }, [user, rangeStart, today]);

  useEffect(() => { loadData(); }, [loadData]);

  // Metrics
  const totalMins = rangeEntries.reduce((s, e) => s + e.duration_minutes, 0);
  const billableMins = rangeEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration_minutes, 0);
  const nonBillableMins = totalMins - billableMins;
  const billableValue = rangeEntries.reduce((s, e) => s + (e.billable_value || 0), 0);
  const invoicedTotal = invoices.filter((i) => i.status === "sent" || i.status === "paid").reduce((s, i) => s + (i.total_amount || 0), 0);
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total_amount || 0), 0);

  // Today summary
  const todayMins = todayEntries.reduce((s, e) => s + e.duration_minutes, 0);

  // === SECTION 1: Stacked bar chart data ===
  const clientIds = useMemo(() => [...new Set(rangeEntries.map((e) => e.client_id).filter(Boolean))] as string[], [rangeEntries]);
  const hasUnassigned = rangeEntries.some((e) => !e.client_id);

  const stackedChartData = useMemo(() => {
    const days = getDaysInRange(rangeStart);
    const colorMap: Record<string, string> = {};
    clientIds.forEach((id, i) => { colorMap[id] = CLIENT_COLORS[i % CLIENT_COLORS.length]; });
    colorMap["unassigned"] = "hsl(240 5% 75%)";

    return days.map((day) => {
      const dayEntries = rangeEntries.filter((e) => e.entry_date === day);
      const row: any = {
        date: day,
        label: new Date(day + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        _total: dayEntries.reduce((s, e) => s + e.duration_minutes / 60, 0),
      };
      clientIds.forEach((cid) => {
        row[cid] = dayEntries.filter((e) => e.client_id === cid).reduce((s, e) => s + e.duration_minutes / 60, 0);
      });
      const unassigned = dayEntries.filter((e) => !e.client_id).reduce((s, e) => s + e.duration_minutes / 60, 0);
      if (unassigned > 0) row["unassigned"] = unassigned;
      return row;
    });
  }, [rangeEntries, rangeStart, clientIds]);

  // === SECTION 2: Client billing summary ===
  const clientBillingSummary = useMemo(() => {
    const map: Record<string, { hours: number; billableHours: number; value: number; unbilledValue: number; currency: string }> = {};
    rangeEntries.forEach((e) => {
      const key = e.client_id ?? "unassigned";
      if (!map[key]) map[key] = { hours: 0, billableHours: 0, value: 0, unbilledValue: 0, currency: e.rate_currency ?? "EUR" };
      map[key].hours += e.duration_minutes / 60;
      if (e.billable) {
        map[key].billableHours += e.duration_minutes / 60;
        map[key].value += e.billable_value || 0;
        if (e.billing_status === "unbilled") {
          map[key].unbilledValue += e.billable_value || 0;
        }
      }
    });
    return Object.entries(map)
      .map(([id, d]) => ({
        id,
        name: id === "unassigned" ? "Unassigned" : (clients[id] ?? "Unknown"),
        ...d,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [rangeEntries, clients]);

  // === SECTION 3: Filtered recent activity ===
  const filteredEntries = useMemo(() => {
    let result = rangeEntries;
    if (typeFilter !== "all") result = result.filter((e) => e.entry_type === typeFilter);
    if (billableFilter === "billable") result = result.filter((e) => e.billable);
    if (billableFilter === "non-billable") result = result.filter((e) => !e.billable);
    if (clientFilter) result = result.filter((e) => e.client_id === clientFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        (e.client_name ?? "").toLowerCase().includes(q) ||
        (e.project_name ?? "").toLowerCase().includes(q) ||
        (e.task_name ?? "").toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [rangeEntries, typeFilter, billableFilter, clientFilter, search]);

  const groupedEntries = useMemo(() => {
    const groups: { date: string; label: string; entries: TimeEntry[] }[] = [];
    const dateMap = new Map<string, TimeEntry[]>();
    filteredEntries.forEach((e) => {
      const d = e.entry_date ?? "unknown";
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d)!.push(e);
    });
    const sortedDates = [...dateMap.keys()].sort((a, b) => b.localeCompare(a));
    sortedDates.forEach((d) => {
      const dateObj = new Date(d + "T00:00:00");
      const label = dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      groups.push({ date: d, label, entries: dateMap.get(d)! });
    });
    return groups;
  }, [filteredEntries]);

  const hasFilters = typeFilter !== "all" || billableFilter !== "all" || clientFilter !== "" || search !== "";
  const clearFilters = () => { setSearch(""); setTypeFilter("all"); setBillableFilter("all"); setClientFilter(""); };

  // === SECTION 4: Chart data ===
  const pieData = [
    { name: "Billable", value: billableMins, fill: "hsl(45 93% 58%)" },
    { name: "Non-billable", value: nonBillableMins, fill: "hsl(240 5% 75%)" },
  ].filter((d) => d.value > 0);

  const projectHoursData = useMemo(() => {
    const map: Record<string, { hours: number; clientName: string }> = {};
    rangeEntries.forEach((e) => {
      const key = e.project_id ?? "unassigned";
      if (!map[key]) map[key] = { hours: 0, clientName: e.client_id ? (clients[e.client_id] ?? "") : "" };
      map[key].hours += e.duration_minutes / 60;
    });
    return Object.entries(map)
      .map(([id, d]) => ({ name: id === "unassigned" ? "Unassigned" : (projects[id] ?? "Unknown"), hours: +d.hours.toFixed(1), client: d.clientName }))
      .sort((a, b) => b.hours - a.hours);
  }, [rangeEntries, clients, projects]);

  const dailyData = useMemo(() => {
    const days = getDaysInRange(rangeStart);
    const map: Record<string, number> = {};
    rangeEntries.forEach((e) => { map[e.entry_date ?? ""] = (map[e.entry_date ?? ""] || 0) + e.duration_minutes / 60; });
    return days.map((d) => ({
      date: new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      hours: +(map[d] || 0).toFixed(1),
    }));
  }, [rangeEntries, rangeStart]);

  // Break stats
  const breakEntries = rangeEntries.filter((e) => (e.break_minutes ?? 0) > 0);
  const totalBreakMins = breakEntries.reduce((s, e) => s + (e.break_minutes ?? 0), 0);
  const avgBreakPerDay = dailyData.length > 0 ? totalBreakMins / dailyData.length : 0;
  const breakPct = totalMins > 0 ? (totalBreakMins / totalMins) * 100 : 0;
  const longestBreak = breakEntries.reduce((max, e) => Math.max(max, e.break_minutes ?? 0), 0);

  const handleEdit = (entry: TimeEntry) => {
    setEditEntry(entry as ExistingEntry);
    setEditSession({ durationMinutes: entry.duration_minutes, breakMinutes: entry.break_minutes ?? 0, startedAt: null, entryType: entry.entry_type ?? "timer" });
    setAssignOpen(true);
  };

  const handleEditSave = async (_s: SessionData, a: AssignmentResult) => {
    if (!editEntry || !user) return;
    try {
      await supabase.from("time_entries").update({
        client_id: a.clientId, project_id: a.projectId,
        task_id: a.taskId,
        notes: a.notes || null, tags: a.tags.length ? a.tags : null,
        billable: a.billable, rate_amount: a.rateAmount,
        rate_currency: a.rateCurrency, rate_unit: a.rateAmount ? a.rateUnit : null,
        billable_value: a.billableValue,
      }).eq("id", editEntry.id);
      toast.success("Entry updated.");
      setAssignOpen(false); setEditEntry(null); loadData();
    } catch { toast.error("Something went wrong."); }
  };

  const handleExportCSV = () => {
    const headers = "Date,Client,Project,Task,Duration (min),Billable,Rate,Value,Notes,Tags,Type";
    const rows = rangeEntries.map((e) => [
      e.entry_date, e.client_name ?? "", e.project_name ?? "", e.task_name ?? "",
      e.duration_minutes, e.billable ? "Yes" : "No", e.rate_amount ?? "",
      e.billable_value ?? "", `"${(e.notes ?? "").replace(/"/g, '""')}"`,
      (e.tags ?? []).join(";"), e.entry_type ?? "",
    ].join(","));
    const blob = new Blob([headers + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `trace-report-${rangeStart}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported.");
  };

  const handleMarkPaid = async (invoiceId: string) => {
    await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoiceId);
    await supabase.from("time_entries").update({ billing_status: "paid" }).eq("invoice_id", invoiceId);
    toast.success("Invoice marked as paid.");
    loadData();
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    await supabase.from("invoices").update({ status: "void" }).eq("id", invoiceId);
    await supabase.from("time_entries").update({ billing_status: "unbilled", invoice_id: null }).eq("invoice_id", invoiceId);
    toast.success("Invoice voided.");
    loadData();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="pb-24 px-4 overflow-x-hidden">
      {/* Date range filter */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className="px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors"
            style={{
              background: range === r.key ? "hsl(var(--primary))" : "transparent",
              color: range === r.key ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
              border: range === r.key ? "none" : "1px solid hsl(var(--border))",
            }}
          >{r.label}</button>
        ))}
      </div>

      {/* Pro content wrapper */}
      <div className="relative">
        {isFree && (
          <div className="sticky top-20 z-10 flex justify-center pointer-events-auto mb-4">
            <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-lg max-w-[300px]">
              <Crown className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">Premium Feature</h3>
              <p className="text-sm text-muted-foreground mt-1">Unlock detailed reports, billing insights, and CSV / PDF export.</p>
              <Button className="w-full mt-4 bg-primary text-primary-foreground rounded-[28px] h-12 font-bold" onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
              <button className="text-sm text-muted-foreground underline mt-2" onClick={() => {}}>Maybe later</button>
            </div>
          </div>
        )}

        <div className={isFree ? "blur-sm pointer-events-none select-none" : ""}>

          {/* ═══════════════════════════════════════════
              SECTION 1 — Timeline Chart (Stacked Bar)
              ═══════════════════════════════════════════ */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Timeline</h3>

            {/* Metric cards row */}
            <div className="flex gap-2 overflow-x-auto mb-3 pb-1 -mx-1 px-1">
              {[
                { label: "Total", value: formatHHMM(totalMins) },
                { label: "Billable", value: formatHHMM(billableMins) },
                { label: "Non-billable", value: formatHHMM(nonBillableMins) },
                { label: "Est. value", value: `€${billableValue.toFixed(0)}` },
              ].map((m) => (
                <div key={m.label} className="min-w-[90px] p-2.5 rounded-xl border border-border bg-card shrink-0">
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap">{m.label}</p>
                  <p className="font-mono text-base font-bold text-foreground whitespace-nowrap">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Stacked bar chart */}
            {stackedChartData.length > 0 && (
              <>
                <div className="w-full overflow-x-auto" style={{ minHeight: 200 }}>
                  <div style={{ minWidth: Math.max(stackedChartData.length * 32, 300) }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={stackedChartData} barCategoryGap="20%">
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}h`} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                          formatter={(value: number, name: string) => {
                            const label = name === "unassigned" ? "Unassigned" : (clients[name] ?? name);
                            return [`${value.toFixed(1)}h`, label];
                          }}
                          labelFormatter={(label) => label}
                        />
                        {clientIds.map((cid, i) => (
                          <Bar key={cid} dataKey={cid} stackId="a" fill={CLIENT_COLORS[i % CLIENT_COLORS.length]}
                            radius={i === clientIds.length - 1 && !hasUnassigned ? [3, 3, 0, 0] : undefined}
                            name={cid} />
                        ))}
                        {hasUnassigned && (
                          <Bar dataKey="unassigned" stackId="a" fill="hsl(240 5% 75%)" radius={[3, 3, 0, 0]} name="unassigned" />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-2">
                  {clientIds.map((cid, i) => (
                    <div key={cid} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: CLIENT_COLORS[i % CLIENT_COLORS.length] }} />
                      {clients[cid] ?? "Unknown"}
                    </div>
                  ))}
                  {hasUnassigned && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(240 5% 75%)" }} />
                      Unassigned
                    </div>
                  )}
                </div>
              </>
            )}

            {stackedChartData.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No data for this period.</p>
            )}
          </div>

          {/* ═══════════════════════════════════════════
              SECTION 2 — Client Billing Summary
              ═══════════════════════════════════════════ */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Client Billing</h3>
              {isPro && (
                <Button size="sm" className="bg-primary text-primary-foreground rounded-full h-8 px-4 text-xs font-bold gap-1" onClick={() => setBillingOpen(true)}>
                  <CreditCard className="w-3.5 h-3.5" /> Bill Clients
                </Button>
              )}
            </div>

            {clientBillingSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No entries in this period.</p>
            ) : (
              <div className="space-y-2">
                {clientBillingSummary.map((c, i) => {
                  const sym = CURRENCY_SYMBOLS[c.currency] ?? "€";
                  return (
                    <div key={c.id} className="p-3 rounded-xl border border-border bg-card">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.id === "unassigned" ? "hsl(240 5% 75%)" : CLIENT_COLORS[i % CLIENT_COLORS.length] }} />
                          <span className="text-sm font-medium text-foreground">{c.name}</span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-foreground">{formatHHMM(Math.round(c.hours * 60))}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>Billable: {c.billableHours.toFixed(1)}h</span>
                        <span>Value: {sym}{c.value.toFixed(2)}</span>
                        {c.unbilledValue > 0 && (
                          <span className="text-primary font-medium">Unbilled: {sym}{c.unbilledValue.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Invoice totals row */}
            {(invoicedTotal > 0 || paidTotal > 0) && (
              <div className="flex gap-2 mt-3">
                <div className="flex-1 p-2.5 rounded-xl border border-border bg-card">
                  <p className="text-[10px] text-muted-foreground">Invoiced</p>
                  <p className="font-mono text-base font-bold text-foreground">€{invoicedTotal.toFixed(0)}</p>
                </div>
                <div className="flex-1 p-2.5 rounded-xl border border-border bg-card">
                  <p className="text-[10px] text-muted-foreground">Paid</p>
                  <p className="font-mono text-base font-bold text-foreground">€{paidTotal.toFixed(0)}</p>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════
              SECTION 3 — Recent Activity (filterable)
              ═══════════════════════════════════════════ */}
          <div className="mb-6">
            <button className="flex items-center justify-between w-full mb-2" onClick={() => setShowRecentActivity(!showRecentActivity)}>
              <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
              {showRecentActivity ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showRecentActivity && (
              <>
                {/* Search */}
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9 h-9" placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>

                {/* Filter chips */}
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {(["all", "timer", "manual", "shift", "call"] as EntryTypeFilter[]).map((t) => (
                    <button key={t} onClick={() => setTypeFilter(t)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors"
                      style={{
                        background: typeFilter === t ? "hsl(var(--primary))" : "transparent",
                        color: typeFilter === t ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                        border: typeFilter === t ? "none" : "1px solid hsl(var(--border))",
                      }}
                    >{t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}</button>
                  ))}
                  {(["all", "billable", "non-billable"] as BillableFilter[]).map((b) => (
                    <button key={b} onClick={() => setBillableFilter(b)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors"
                      style={{
                        background: billableFilter === b ? "hsl(var(--primary))" : "transparent",
                        color: billableFilter === b ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                        border: billableFilter === b ? "none" : "1px solid hsl(var(--border))",
                      }}
                    >{b === "all" ? "All" : b === "billable" ? "Billable" : "Non-billable"}</button>
                  ))}
                  {Object.keys(clients).length > 0 && (
                    <select
                      value={clientFilter}
                      onChange={(e) => setClientFilter(e.target.value)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-border bg-transparent text-muted-foreground"
                    >
                      <option value="">All clients</option>
                      {Object.entries(clients).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  )}
                  {hasFilters && (
                    <button onClick={clearFilters} className="text-[11px] text-primary hover:underline">Clear</button>
                  )}
                </div>

                {/* Entries grouped by date */}
                {filteredEntries.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">No entries match your filters.</p>
                    {hasFilters && <button onClick={clearFilters} className="text-xs text-primary hover:underline mt-1">Clear filters</button>}
                  </div>
                )}

                {groupedEntries.map((group) => (
                  <div key={group.date} className="mb-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.entries.map((entry) => (
                        <button key={entry.id}
                          className="flex items-center w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors gap-3"
                          onClick={() => { setSelectedEntry(entry); setDetailOpen(true); }}
                        >
                          {entryTypeIcon(entry.entry_type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {entry.client_name ? `${entry.client_name}${entry.project_name ? ` — ${entry.project_name}` : ""}` : <span className="text-muted-foreground">Unassigned</span>}
                            </p>
                            {entry.task_name && <p className="text-xs text-muted-foreground truncate">{entry.task_name}</p>}
                            {entry.notes && <p className="text-xs text-muted-foreground truncate">{entry.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-sm font-semibold">{formatHHMM(entry.duration_minutes)}</span>
                            <span className={`w-2 h-2 rounded-full ${entry.billable ? "bg-primary" : "bg-muted-foreground/30"}`} />
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ═══════════════════════════════════════════
              SECTION 4 — Charts
              ═══════════════════════════════════════════ */}
          <div className="mb-6">
            <button className="flex items-center justify-between w-full mb-3" onClick={() => setShowCharts(!showCharts)}>
              <h3 className="text-sm font-semibold text-foreground">Charts & Insights</h3>
              {showCharts ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showCharts && (
              <>
                {/* Billable vs Non-billable */}
                {pieData.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Billable vs Non-billable</h4>
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={120} height={120}>
                        <PieChart>
                          <Pie data={pieData} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                            {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1">
                        {pieData.map((d) => (
                          <div key={d.name} className="flex items-center gap-2 text-xs text-foreground">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />
                            {d.name}: {formatHHMM(d.value)} ({totalMins > 0 ? Math.round((d.value / totalMins) * 100) : 0}%)
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Hours by Project */}
                {projectHoursData.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Hours by Project</h4>
                    <ResponsiveContainer width="100%" height={projectHoursData.length * 36 + 20}>
                      <BarChart data={projectHoursData} layout="vertical" margin={{ left: 0, right: 10 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip formatter={(v: number) => [`${v.toFixed(1)}h`]} />
                        <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                          {projectHoursData.map((_, i) => <Cell key={i} fill={CLIENT_COLORS[i % CLIENT_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Daily Activity line */}
                {dailyData.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Daily Activity</h4>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} width={30} />
                        <Tooltip formatter={(v: number) => [`${v.toFixed(1)}h`]} />
                        <Line type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Break Patterns */}
                {breakEntries.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time You Stepped Away</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Avg break / day", value: `${Math.round(avgBreakPerDay)}m` },
                        { label: "Break % of total", value: `${breakPct.toFixed(1)}%` },
                        { label: "Total break time", value: formatHHMM(totalBreakMins) },
                        { label: "Longest break", value: `${longestBreak}m` },
                      ].map((s) => (
                        <div key={s.label} className="p-3 rounded-xl border border-border bg-card">
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                          <p className="font-mono text-lg font-bold text-foreground">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Export buttons */}
          <div className="flex gap-2 mb-6">
            <Button variant="outline" className="flex-1 gap-1 rounded-xl" onClick={handleExportCSV}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button variant="outline" className="flex-1 gap-1 rounded-xl" onClick={() => toast.info("PDF export coming soon.")}>
              <Download className="w-4 h-4" /> Export PDF
            </Button>
          </div>

          {/* Invoice History */}
          {invoices.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-2">Invoice History</h3>
              <div className="space-y-1">
                {invoices.map((inv) => (
                  <div key={inv.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border border-border ${inv.status === "void" ? "opacity-50 line-through" : ""}`}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{clients[inv.client_id] ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{CURRENCY_SYMBOLS[inv.currency] ?? "€"}{inv.total_amount?.toFixed(2)}</span>
                      <span className={`w-2 h-2 rounded-full ${inv.status === "paid" ? "bg-emerald-500" : inv.status === "void" ? "bg-muted-foreground/30" : "bg-primary"}`} />
                    </div>
                    {inv.status === "sent" && (
                      <div className="flex gap-1 ml-2">
                        <button className="text-xs text-primary hover:underline" onClick={() => handleMarkPaid(inv.id)}>Paid</button>
                        <button className="text-xs text-destructive hover:underline" onClick={() => handleVoidInvoice(inv.id)}>Void</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              SECTION 5 — Trash link
              ═══════════════════════════════════════════ */}
          <div className="flex justify-center py-4">
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Trash2 className="w-4 h-4" />
              View Trash
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EntryDetailSheet entry={selectedEntry} open={detailOpen} onOpenChange={setDetailOpen} onEdit={handleEdit} onDeleted={() => loadData()} />
      <AssignmentModal open={assignOpen} session={editSession} existingEntry={editEntry}
        onSave={handleEditSave} onSkip={() => { setAssignOpen(false); setEditEntry(null); }} />
      <BillingDialog open={billingOpen} onOpenChange={setBillingOpen} onComplete={loadData} />
      <PaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default ReportsPage;
