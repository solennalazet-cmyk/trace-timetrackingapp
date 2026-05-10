import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Sector as RechartsSector,
} from "recharts";
import {
  ChevronDown, ChevronUp, Timer, PenLine, Clock, Phone,
  Crown, Download, Trash2, X,
} from "lucide-react";
import { startOfWeek } from "date-fns";
import DateRangePicker from "@/components/DateRangePicker";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey, getClientColor, SUNRISE_PALETTE } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { type RoundingSettings, DEFAULT_ROUNDING, roundDuration, roundAmount, roundedBillableValue, aggregateWithRounding, entryDisplayValues, hasActiveRounding } from "@/lib/rounding";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import EntryDetailSheet, { type TimeEntry } from "@/components/EntryDetailSheet";
import AssignmentModal, { type SessionData, type AssignmentResult, type ExistingEntry } from "@/components/AssignmentModal";
import BillingDialog from "@/components/BillingDialog";
import PrepareBillingSheet from "@/components/PrepareBillingSheet";
import PaywallModal from "@/components/PaywallModal";
import ClientBillingSummary from "@/components/ClientBillingSummary";
import UnassignedPanel from "@/components/UnassignedPanel";
import TrashView from "@/components/TrashView";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import BoostOverlay from "@/components/BoostOverlay";
import { Sparkles } from "lucide-react";
import { markBoostCompleted } from "@/lib/boost-challenges";
import ExportDialog from "@/components/ExportDialog";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

// (PeakHoursChart removed — replaced by Decimal Hours card)

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const LS_KEY = "trace_user_settings";

const getCurrentWeekRange = (weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6, now = new Date()) => {
  const from = startOfWeek(now, { weekStartsOn });
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from, to };
};

const getDaysInRange = (startStr: string, endStr: string): string[] => {
  const days: string[] = [];
  const [sY, sM, sD] = startStr.split("-").map(Number);
  const [eY, eM, eD] = endStr.split("-").map(Number);
  const start = new Date(sY, sM - 1, sD);
  const end = new Date(eY, eM - 1, eD);
  let d = new Date(start);
  while (d <= end) {
    days.push(toLocalDateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
};

const renderCompactDateTick = ({ x, y, payload }: any) => {
  const val = String(payload?.value ?? "");
  // Format: "Wed 2 Apr" — split to weekday + date
  const parts = val.split(" ");
  const weekday = parts[0] ?? "";
  const dateStr = parts.slice(1).join(" ");
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">
        <tspan x={0} dy={10}>{weekday}</tspan>
        <tspan x={0} dy={11}>{dateStr}</tspan>
      </text>
    </g>
  );
};

const ReportsPage = () => {
  const { user, profile } = useAuth();
  const isFree = profile?.plan === "free";
  const isPro = profile?.plan === "pro" || profile?.plan === "trial";

  // User settings for goals
  const [dailyHourTarget, setDailyHourTarget] = useState(0);
  const [revenueTarget, setRevenueTarget] = useState(0);
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [rounding, setRounding] = useState<RoundingSettings>(DEFAULT_ROUNDING);

  // Settings are loaded inside the date initialization effect below

  // Initialize dates based on default range
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [datesInitialized, setDatesInitialized] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(new Date());
  const [dateTo, setDateTo] = useState<Date>(new Date());

  // Mark settings as loaded after fetch
  const [settingsVer, setSettingsVer] = useState(0);

  useEffect(() => {
    const handler = () => setSettingsVer((v) => v + 1);
    window.addEventListener("trace-settings-changed", handler);
    return () => window.removeEventListener("trace-settings-changed", handler);
  }, []);

  useEffect(() => {
    if (!user) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setDailyHourTarget(parsed.daily_hour_target ?? 0);
          setRevenueTarget(parsed.revenue_target ?? 0);
          setWeekStartDay(parsed.week_start_day ?? 1);
          setRounding({
            round_duration: parsed.round_duration ?? "none",
            round_duration_to: parsed.round_duration_to ?? 15,
            round_amount: parsed.round_amount ?? "none",
            round_amount_to: parsed.round_amount_to ?? 0.01,
            round_scope: parsed.round_scope ?? "session",
          });
        }
      } catch {}
      setSettingsLoaded(true);
      return;
    }

    supabase.from("user_settings")
      .select("daily_hour_target, revenue_target, week_start_day, round_duration, round_duration_to, round_amount, round_amount_to, round_scope, default_report_range")
      .eq("user_id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setDailyHourTarget((data as any).daily_hour_target ?? 0);
          setRevenueTarget((data as any).revenue_target ?? 0);
          setWeekStartDay((data as any).week_start_day ?? 1);
          setRounding({
            round_duration: (data as any).round_duration ?? "none",
            round_duration_to: (data as any).round_duration_to ?? 15,
            round_amount: (data as any).round_amount ?? "none",
            round_amount_to: (data as any).round_amount_to ?? 0.01,
            round_scope: (data as any).round_scope ?? "session",
          });
        }
        setSettingsLoaded(true);
      });
  }, [user, settingsVer]);

  useEffect(() => {
    if (datesInitialized || !settingsLoaded) return;
    const { from, to } = getCurrentWeekRange(weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    setDateFrom(from);
    setDateTo(to);
    setDatesInitialized(true);
  }, [weekStartDay, datesInitialized, settingsLoaded]);

  const [rangeEntries, setRangeEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [projects, setProjectsMap] = useState<Record<string, string>>({});
  const [tasks, setTasksMap] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ExistingEntry | null>(null);
  const [editSession, setEditSession] = useState<SessionData | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingClientId, setBillingClientId] = useState<string | null>(null);
  const [prepareBillingOpen, setPrepareBillingOpen] = useState(false);
  const [prepareBillingClientId, setPrepareBillingClientId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [activeTimeIdx, setActiveTimeIdx] = useState<number | undefined>(undefined);
  const [activeTurnIdx, setActiveTurnIdx] = useState<number | undefined>(undefined);
  const [boostOpen, setBoostOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const navigate = useNavigate();

  const rangeStart = toLocalDateKey(dateFrom);
  const rangeEnd = toLocalDateKey(dateTo);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (user) {
      const entrySelect = "id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, billable_value, client_id, project_id, task_id, billing_status, start_time, client:clients(id, name), project:projects(id, name), task:tasks(id, name)";
      const [{ data: re }, { data: c }, { data: p }, { data: t }, { data: inv }] = await Promise.all([
        supabase.from("time_entries").select(entrySelect)
          .eq("user_id", user.id).gte("entry_date", rangeStart).lte("entry_date", rangeEnd).is("deleted_at", null).order("entry_date", { ascending: false }),
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
        client_name: (e.client as any)?.name ?? undefined,
        project_name: (e.project as any)?.name ?? undefined,
        task_name: (e.task as any)?.name ?? undefined,
      }));

      setRangeEntries(enrich(re ?? []) as TimeEntry[]);
      setInvoices(inv ?? []);
    } else {
      const all = getAnonymousEntries();
      const rangeE = all.filter((e: any) => (e.entry_date ?? "") >= rangeStart && (e.entry_date ?? "") <= rangeEnd).map((e: any, i: number) => ({ ...e, id: e.id ?? `anon-r-${i}` }));
      setRangeEntries(rangeE);
      setClients({}); setProjectsMap({}); setTasksMap({}); setInvoices([]);
    }
    setLoading(false);
  }, [user, rangeStart, rangeEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtered view by client
  const displayEntries = useMemo(() => {
    if (!clientFilter) return rangeEntries;
    return rangeEntries.filter((e) => e.client_id === clientFilter);
  }, [rangeEntries, clientFilter]);

  // Helper: scope-aware display values per entry
  const ed = (e: TimeEntry) => entryDisplayValues(e, rounding);
  // For chart grouping: per-entry display minutes
  const edMins = (e: TimeEntry) => ed(e).displayMinutes;

  // Core metrics (scope-aware aggregation)
  const { totalMinutes: totalMins, totalValue: billableValue } = useMemo(
    () => aggregateWithRounding(displayEntries, rounding),
    [displayEntries, rounding]
  );
  const { totalMinutes: billableMins } = useMemo(
    () => aggregateWithRounding(displayEntries.filter((e) => e.billable), rounding),
    [displayEntries, rounding]
  );
  const nonBillableMins = totalMins - billableMins;

  // Client IDs
  const clientIds = useMemo(() => [...new Set(rangeEntries.map((e) => e.client_id).filter(Boolean))] as string[], [rangeEntries]);
  const hasUnassigned = displayEntries.some((e) => !e.client_id);

  const clientColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    clientIds.forEach((id) => { map[id] = getClientColor(id); });
    map["unassigned"] = "hsl(240 5% 75%)";
    return map;
  }, [clientIds]);

  // Days in range for pro-rating
  const daysInRange = useMemo(() => {
    return getDaysInRange(rangeStart, rangeEnd).length;
  }, [rangeStart, rangeEnd]);

  // Pro-rated goals
  const proratedHourTarget = dailyHourTarget > 0 ? dailyHourTarget * daysInRange : 0;
  const proratedRevenueTarget = revenueTarget > 0 ? revenueTarget * (daysInRange / 30) : 0;
  const hourProgress = proratedHourTarget > 0 ? Math.min(100, (totalMins / 60 / proratedHourTarget) * 100) : 0;
  const revenueProgress = proratedRevenueTarget > 0 ? Math.min(100, (billableValue / proratedRevenueTarget) * 100) : 0;

  // ══ DONUT CHART DATA ══
  // Time donut: per-client hours (or per-project/task when single client filtered)
  const timeDonutData = useMemo(() => {
    const data: { name: string; initials: string; value: number; fill: string }[] = [];

    // Single client filtered → drill down by project (or task if ≤1 project)
    if (clientFilter) {
      const projectMins: Record<string, number> = {};
      const taskMins: Record<string, number> = {};
      let projectCount = 0;
      const seenProjects = new Set<string>();

      displayEntries.forEach((e) => {
        const pKey = e.project_id ?? "no-project";
        projectMins[pKey] = (projectMins[pKey] || 0) + edMins(e);
        if (e.project_id && !seenProjects.has(e.project_id)) { seenProjects.add(e.project_id); projectCount++; }
        const tKey = e.task_id ?? "no-task";
        taskMins[tKey] = (taskMins[tKey] || 0) + edMins(e);
      });

      if (projectCount <= 1) {
        // Show task breakdown
        Object.entries(taskMins).forEach(([key, mins]) => {
          const name = key === "no-task" ? "No task" : (tasks[key] ?? "Unknown");
          const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
          const idx = data.length;
          data.push({ name, initials, value: mins, fill: SUNRISE_PALETTE[idx % SUNRISE_PALETTE.length] });
        });
      } else {
        // Show project breakdown
        Object.entries(projectMins).forEach(([key, mins]) => {
          const name = key === "no-project" ? "No project" : (projects[key] ?? "Unknown");
          const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
          const idx = data.length;
          data.push({ name, initials, value: mins, fill: SUNRISE_PALETTE[idx % SUNRISE_PALETTE.length] });
        });
      }
      return data;
    }

    // All clients view
    const map: Record<string, number> = {};
    displayEntries.forEach((e) => {
      const key = e.client_id ?? "unassigned";
      map[key] = (map[key] || 0) + edMins(e);
    });
    clientIds.forEach((id) => {
      if (map[id]) {
        const name = clients[id] ?? "Unknown";
        const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
        data.push({ name, initials, value: map[id], fill: getClientColor(id) });
      }
    });
    if (map["unassigned"]) data.push({ name: "Unassigned", initials: "NA", value: map["unassigned"], fill: "hsl(240 5% 75%)" });
    return data;
  }, [displayEntries, clientIds, clients, clientFilter, projects, tasks, rounding]);

  // Turnover donut: per-client billable value (always by client, even when filtered)
  const turnoverDonutData = useMemo(() => {
    const data: { name: string; initials: string; value: number; fill: string }[] = [];
    const map: Record<string, number> = {};
    displayEntries.forEach((e) => {
      if (!e.client_id) return;
      const val = ed(e).displayValue;
      if (!val) return;
      map[e.client_id] = (map[e.client_id] || 0) + val;
    });
    clientIds.forEach((id) => {
      if (map[id]) {
        const name = clients[id] ?? "Unknown";
        const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
        data.push({ name, initials, value: map[id], fill: getClientColor(id) });
      }
    });
    return data;
  }, [displayEntries, clientIds, clients, rounding]);

  const totalTurnoverValue = turnoverDonutData.reduce((s, d) => s + d.value, 0);

  // ══ STACKED BAR CHART ══
  const stackedChartData = useMemo(() => {
    const days = getDaysInRange(rangeStart, rangeEnd);
    const chartClientIds = clientFilter ? [clientFilter] : clientIds;
    const allRows = days.map((day) => {
      const dayEntries = displayEntries.filter((e) => e.entry_date === day);
      const row: any = {
        date: day,
        label: new Date(day + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
        _total: dayEntries.reduce((s, e) => s + edMins(e) / 60, 0),
      };
      chartClientIds.forEach((cid) => {
        row[cid] = dayEntries.filter((e) => e.client_id === cid).reduce((s, e) => s + edMins(e) / 60, 0);
      });
      if (!clientFilter) {
        const un = dayEntries.filter((e) => !e.client_id).reduce((s, e) => s + edMins(e) / 60, 0);
        if (un > 0) row["unassigned"] = un;
      }
      return row;
    });
    // Trim empty days from start and end
    let first = allRows.findIndex((r) => r._total > 0);
    let last = allRows.length - 1;
    while (last > first && allRows[last]._total === 0) last--;
    if (first === -1) return [];
    return allRows.slice(first, last + 1);
  }, [displayEntries, rangeStart, rangeEnd, clientIds, clientFilter]);

  // Trash
  const [trashCount, setTrashCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("time_entries").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).not("deleted_at", "is", null)
      .then(({ count }) => setTrashCount(count ?? 0));
  }, [user, rangeEntries]);

  const handleEdit = (entry: TimeEntry) => {
    setEditEntry(entry as ExistingEntry);
    setEditSession({ durationMinutes: entry.duration_minutes, breakMinutes: entry.break_minutes ?? 0, startedAt: null, entryType: entry.entry_type ?? "timer" });
    setAssignOpen(true);
  };

  const handleEditSave = async (_s: SessionData, a: AssignmentResult) => {
    if (!editEntry || !user) return;
    try {
      const shouldResetBilling =
        editEntry.client_id !== a.clientId ||
        editEntry.project_id !== a.projectId ||
        editEntry.task_id !== a.taskId ||
        (editEntry.billable ?? true) !== a.billable ||
        editEntry.rate_amount !== a.rateAmount ||
        (editEntry.rate_currency ?? "EUR") !== a.rateCurrency ||
        (editEntry.rate_unit ?? null) !== (a.rateAmount != null ? a.rateUnit : null);

      await supabase.from("time_entries").update({
        client_id: a.clientId, project_id: a.projectId,
        task_id: a.taskId,
        notes: a.notes || null, tags: a.tags.length ? a.tags : null,
        billable: a.billable, rate_amount: a.rateAmount,
        rate_currency: a.rateCurrency, rate_unit: a.rateAmount != null ? a.rateUnit : null,
        billable_value: a.billableValue,
        ...(shouldResetBilling ? { billing_status: "unbilled", invoice_id: null } : {}),
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

  // Scroll-based header blur for Reports page
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

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="pb-24 px-4 overflow-x-hidden">
      {/* ── 1. Date picker ── */}
      <div className="mb-3">
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
          weekStartsOn={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
        />
      </div>

      {/* ── 2. Client filter chips ── */}
      {clientIds.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-none">
          <button
            onClick={() => setClientFilter("")}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              !clientFilter
                ? "border-primary bg-primary/20 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/30"
            }`}
          >
            All clients
          </button>
          {clientIds.map((id, i) => (
            <button
              key={id}
              onClick={() => setClientFilter(clientFilter === id ? "" : id)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex items-center gap-1.5 ${
                clientFilter === id
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: getClientColor(id) }} />
              {clients[id] ?? "Unknown"}
            </button>
          ))}
          {clientFilter && (
            <button
              onClick={() => setClientFilter("")}
              className="shrink-0 px-2 py-1.5 text-xs text-foreground font-medium hover:underline"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Pro gate */}
      <div className="relative">
        {isFree && (
          <div className="sticky top-20 z-10 flex justify-center pointer-events-auto mb-4">
            <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-lg max-w-[300px]">
              <Crown className="w-8 h-8 text-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">Premium Feature</h3>
              <p className="text-sm text-muted-foreground mt-1">Unlock detailed reports, billing insights, and CSV / PDF export.</p>
              <Button className="w-full mt-4 bg-primary text-primary-foreground rounded-[28px] h-12 font-bold" onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </div>
          </div>
        )}

        <div className={isFree ? "blur-sm pointer-events-none select-none" : ""}>

          {/* ── 3. Dual Donut Charts: Time & Turnover ── */}
          {timeDonutData.length > 0 && (() => {
            const total = timeDonutData.reduce((s, d) => s + d.value, 0);
            const totalTurnover = turnoverDonutData.reduce((s, d) => s + d.value, 0);

            const renderInitialsLabel = (props: any, data: { name: string; initials: string; value: number }[], dataTotal: number) => {
              const { cx, cy, midAngle, innerRadius, outerRadius, index } = props;
              const entry = data[index];
              if (!entry || entry.value / dataTotal < 0.06) return null;
              const RADIAN = Math.PI / 180;
              const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
              const x = cx + radius * Math.cos(-midAngle * RADIAN);
              const y = cy + radius * Math.sin(-midAngle * RADIAN);
              return (
                <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
                  {entry.initials}
                </text>
              );
            };

            const renderActiveShape = (props: any) => {
              const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
              const RADIAN = Math.PI / 180;
              const midAngle = (startAngle + endAngle) / 2;
              const labelRadius = outerRadius + 16;
              const lx = cx + labelRadius * Math.cos(-midAngle * RADIAN);
              const ly = cy + labelRadius * Math.sin(-midAngle * RADIAN);
              return (
                <g>
                  <RechartsSector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 4} startAngle={startAngle} endAngle={endAngle} fill={fill} stroke="none" />
                  <text x={lx} y={ly} textAnchor={lx > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fontWeight={600} fill="hsl(var(--foreground))">
                    {payload.name}
                  </text>
                </g>
              );
            };

            const sym = "€";

            return (
              <div className="mb-6">
                <div className="flex justify-center gap-4">
                  {/* Time donut */}
                  <div className="relative [&_svg]:outline-none [&_svg]:border-none [&_svg_*]:outline-none" style={{ width: 175, height: 175 }}>
                    <ResponsiveContainer width={175} height={175}>
                      <PieChart>
                        <Pie
                          data={timeDonutData}
                          innerRadius={42}
                          outerRadius={68}
                          dataKey="value"
                          stroke="none"
                          paddingAngle={1}
                          label={(props) => renderInitialsLabel(props, timeDonutData, total)}
                          labelLine={false}
                          activeIndex={activeTimeIdx}
                          activeShape={renderActiveShape}
                          onMouseEnter={(_, idx) => setActiveTimeIdx(idx)}
                          onMouseLeave={() => setActiveTimeIdx(undefined)}
                          onClick={(_, idx) => setActiveTimeIdx(prev => prev === idx ? undefined : idx)}
                        >
                          {timeDonutData.map((d, i) => <Cell key={i} fill={d.fill} stroke="hsl(var(--background))" strokeWidth={2} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-base font-bold font-mono text-foreground">{`${Math.floor(totalMins / 60)}h${String(totalMins % 60).padStart(2, "0")}`}</span>
                      <span className="text-xs text-muted-foreground">{clientFilter ? (timeDonutData.some(d => d.name !== "No task" && d.name !== "No project") ? (displayEntries.filter(e => e.project_id).length > 0 && new Set(displayEntries.map(e => e.project_id).filter(Boolean)).size > 1 ? "by project" : "by task") : "time") : "time"}</span>
                    </div>
                  </div>

                  {/* Turnover donut */}
                  {turnoverDonutData.length > 0 && (
                    <div className="relative [&_svg]:outline-none [&_svg]:border-none [&_svg_*]:outline-none" style={{ width: 175, height: 175 }}>
                      <ResponsiveContainer width={175} height={175}>
                        <PieChart>
                          <Pie
                            data={turnoverDonutData}
                            innerRadius={42}
                            outerRadius={68}
                            dataKey="value"
                            stroke="none"
                            paddingAngle={1}
                            label={(props) => renderInitialsLabel(props, turnoverDonutData, totalTurnover)}
                            labelLine={false}
                            activeIndex={activeTurnIdx}
                            activeShape={renderActiveShape}
                            onMouseEnter={(_, idx) => setActiveTurnIdx(idx)}
                            onMouseLeave={() => setActiveTurnIdx(undefined)}
                            onClick={(_, idx) => setActiveTurnIdx(prev => prev === idx ? undefined : idx)}
                          >
                            {turnoverDonutData.map((d, i) => <Cell key={i} fill={d.fill} stroke="hsl(var(--background))" strokeWidth={2} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-base font-bold font-mono text-foreground">{sym}{totalTurnoverValue.toFixed(0)}</span>
                        <span className="text-xs text-muted-foreground">turnover</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Billable / Non-billable summary text */}
                <div className="flex justify-center gap-6 mt-3 text-xs text-muted-foreground">
                  <span>Billable: {formatHHMM(billableMins)}</span>
                  {nonBillableMins > 0 && <span>Non-billable: {formatHHMM(nonBillableMins)}</span>}
                </div>

                {/* Compact ranked breakdown — only shown when filtered (decision-driven mobile read) */}
                {clientFilter && timeDonutData.length > 0 && (() => {
                  const sorted = [...timeDonutData].sort((a, b) => b.value - a.value);
                  const top = sorted.slice(0, 4);
                  const restMins = sorted.slice(4).reduce((s, d) => s + d.value, 0);
                  const max = top[0]?.value ?? 1;
                  return (
                    <div className="mt-4 space-y-1.5 max-w-[360px] mx-auto">
                      {top.map((d) => {
                        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                        const barPct = max > 0 ? (d.value / max) * 100 : 0;
                        return (
                          <div key={d.name} className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                            <span className="truncate text-foreground flex-1 min-w-0">{d.name}</span>
                            <div className="relative h-1.5 w-16 rounded-full bg-muted/50 overflow-hidden shrink-0">
                              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${barPct}%`, background: d.fill, opacity: 0.7 }} />
                            </div>
                            <span className="font-mono text-muted-foreground tabular-nums w-12 text-right shrink-0">{formatHHMM(d.value)}</span>
                            <span className="font-mono text-foreground font-semibold tabular-nums w-9 text-right shrink-0">{pct}%</span>
                          </div>
                        );
                      })}
                      {restMins > 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-0.5">
                          <div className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/40" />
                          <span className="flex-1">+{sorted.length - 4} more</span>
                          <span className="font-mono tabular-nums">{formatHHMM(restMins)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── 4. Client Cards ── */}
          {displayEntries.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Clients</h3>
              <ClientBillingSummary
                allEntries={displayEntries}
                clients={clients}
                projects={projects}
                isPro={isPro}
                clientColorMap={clientColorMap}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                rangeLabel={`${dateFrom.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${dateTo.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                onBillClient={(clientId) => {
                  setPrepareBillingClientId(clientId);
                  setPrepareBillingOpen(true);
                }}
                onOpenUnassigned={() => setUnassignedOpen(true)}
                onEditEntry={handleEdit}
                activeClientFilter={clientFilter}
                onFilterClient={(id) => setClientFilter(id ?? "")}
                rounding={rounding}
                onDeleteEntry={async (entryId) => {
                  if (user) {
                    await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entryId);
                    toast("Entry deleted.", {
                      action: { label: "Undo", onClick: async () => {
                        await supabase.from("time_entries").update({ deleted_at: null }).eq("id", entryId);
                        loadData();
                      }},
                      duration: 5000,
                    });
                    loadData();
                  }
                }}
              />
            </div>
          )}

          {/* ── Entry Type Mini Donuts ── */}
          {rangeEntries.length > 0 && (() => {
            // Input-type palette — intentionally distinct from client colors
            // (which use the Sunrise palette: blues, ambers, roses, oranges, golds).
            // We pick neutral/cool tones here so input-type donuts never look like a client.
            const ENTRY_TYPE_COLORS: Record<string, string> = {
              stopwatch: "hsl(215 16% 47%)",  // slate grey
              manual: "hsl(175 55% 42%)",     // teal (was amber — clashed with client gold)
              shift: "hsl(260 35% 55%)",      // muted violet
              focus: "hsl(195 60% 45%)",      // deep cyan
              call: "hsl(150 35% 45%)",       // sage green
              boost: "hsl(280 40% 55%)",      // muted purple
            };
            const ENTRY_TYPE_LABELS: Record<string, string> = {
              stopwatch: "Stopwatch",
              manual: "Manual",
              shift: "Shift",
              focus: "Focus",
              call: "Call Log",
              boost: "Boost",
            };
            const ENTRY_TYPE_ICONS: Record<string, React.ReactNode> = {
              stopwatch: <Timer className="w-3 h-3" />,
              manual: <PenLine className="w-3 h-3" />,
              shift: <Clock className="w-3 h-3" />,
              focus: <Phone className="w-3 h-3" />,
              call: <Phone className="w-3 h-3" />,
              boost: <Sparkles className="w-3 h-3" />,
            };

            // Aggregate by entry type
            const byType: Record<string, { mins: number; value: number; count: number }> = {};
            displayEntries.forEach((e) => {
              const t = e.entry_type ?? "stopwatch";
              if (!byType[t]) byType[t] = { mins: 0, value: 0, count: 0 };
              byType[t].mins += edMins(e);
              byType[t].value += ed(e).displayValue;
              byType[t].count += 1;
            });

            const types = Object.keys(byType);
            if (types.length === 0) return null;

            const hoursData = types.map((t) => ({ name: ENTRY_TYPE_LABELS[t] ?? t, value: byType[t].mins, fill: ENTRY_TYPE_COLORS[t] ?? "hsl(var(--muted-foreground))" }));
            const turnoverData = types.map((t) => ({ name: ENTRY_TYPE_LABELS[t] ?? t, value: byType[t].value, fill: ENTRY_TYPE_COLORS[t] ?? "hsl(var(--muted-foreground))" })).filter((d) => d.value > 0);
            const avgData = types.map((t) => ({ name: ENTRY_TYPE_LABELS[t] ?? t, value: byType[t].count > 0 ? Math.round(byType[t].mins / byType[t].count) : 0, fill: ENTRY_TYPE_COLORS[t] ?? "hsl(var(--muted-foreground))" }));

            const totalTurnover = turnoverData.reduce((s, d) => s + d.value, 0);

            const MiniDonut = ({ data, centerLabel, centerSub, size = 120 }: { data: { name: string; value: number; fill: string }[]; centerLabel: string; centerSub: string; size?: number }) => (
              <div className="relative shrink-0 [&_svg]:outline-none [&_svg]:border-none [&_svg_*]:outline-none" style={{ width: size, height: size }}>
                <ResponsiveContainer width={size} height={size}>
                  <PieChart>
                    <Pie data={data} innerRadius={size * 0.32} outerRadius={size * 0.46} dataKey="value" stroke="hsl(var(--background))" strokeWidth={2} paddingAngle={1}>
                      {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} formatter={(value: number, name: string) => {
                      if (centerSub === "turnover") return [`€${value.toFixed(0)}`, name];
                      return [formatHHMM(value), name];
                    }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-sm font-bold font-mono text-foreground">{centerLabel}</span>
                  <span className="text-[11px] text-muted-foreground">{centerSub === "turnover" ? "turnover" : centerSub}</span>
                </div>
              </div>
            );

            return (
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Input Analysis</h3>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
                  <div className="shrink-0 flex flex-col items-center">
                    <MiniDonut data={hoursData} centerLabel={formatHHMM(totalMins)} centerSub="hours" />
                    <span className="text-xs text-muted-foreground mt-1">Hours</span>
                  </div>
                  <div className="shrink-0 flex flex-col items-center">
                    <MiniDonut data={avgData} centerLabel={formatHHMM(Math.round(totalMins / (displayEntries.length || 1)))} centerSub="avg" />
                    <span className="text-xs text-muted-foreground mt-1">Avg Session</span>
                  </div>
                  {/* Decimal hours — copy-friendly for spreadsheets */}
                  {(() => {
                    const decimal = (totalMins / 60).toFixed(2);
                    const handleCopy = () => {
                      navigator.clipboard.writeText(decimal).then(
                        () => toast.success(`Copied ${decimal}`),
                        () => toast.error("Couldn't copy")
                      );
                    };
                    return (
                      <div className="shrink-0 flex flex-col items-center">
                        <button
                          onClick={handleCopy}
                          className="flex items-center justify-center rounded-full border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                          style={{ width: 120, height: 120 }}
                          title="Tap to copy decimal hours"
                        >
                          <div className="flex flex-col items-center px-2">
                            <span className="text-lg font-bold font-mono text-foreground tabular-nums">{decimal}</span>
                            <span className="text-[11px] text-muted-foreground">decimal h</span>
                            <span className="text-[10px] text-muted-foreground/70 mt-0.5">tap to copy</span>
                          </div>
                        </button>
                        <span className="text-xs text-muted-foreground mt-1">For Excel</span>
                      </div>
                    );
                  })()}
                  {/* Boost mini-metric */}
                  {(() => {
                    const boostMins = displayEntries.filter(e => e.entry_type === "boost").reduce((s, e) => s + edMins(e), 0);
                    if (boostMins === 0) return null;
                    const boostCount = displayEntries.filter(e => e.entry_type === "boost").length;
                    return (
                      <div className="shrink-0 flex flex-col items-center">
                        <div className="flex items-center justify-center rounded-full border-2 border-amber-400/40" style={{ width: 120, height: 120, background: "linear-gradient(135deg, hsl(45 90% 96%), hsl(38 80% 92%))" }}>
                          <div className="flex flex-col items-center">
                            <Sparkles className="w-5 h-5 text-amber-500 mb-1" />
                            <span className="text-sm font-bold font-mono text-foreground">{formatHHMM(boostMins)}</span>
                            <span className="text-[11px] text-muted-foreground">{boostCount} boost{boostCount !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">Growth</span>
                      </div>
                    );
                  })()}
                </div>
                {/* Shared legend */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
                  {types.map((t) => (
                    <div key={t} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className="w-2 h-2 rounded-full" style={{ background: ENTRY_TYPE_COLORS[t] ?? "hsl(var(--muted-foreground))" }} />
                      {ENTRY_TYPE_ICONS[t]} {ENTRY_TYPE_LABELS[t] ?? t}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {rangeEntries.length === 0 && (
            <div className="text-center py-10 mb-6">
              <p className="text-sm text-muted-foreground">No data for this period.</p>
              <p className="text-xs text-muted-foreground mt-1">Start tracking to see your reports.</p>
            </div>
          )}

          {/* ── 4. Goal Progress Bars ── */}
          {(() => {
            const hasGoals = proratedHourTarget > 0 || proratedRevenueTarget > 0;
            const showBlurred = isFree && !hasGoals;
            if (!hasGoals && !showBlurred) return null;
            return (
              <div className="mb-6 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goals</h3>
                  {isPro && (
                    <button
                      onClick={() => setBoostOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors text-xs font-semibold"
                    >
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      Boost
                    </button>
                  )}
                </div>
                {hasGoals && !isFree ? (
                  <>
                    {proratedHourTarget > 0 && (
                      <div>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-sm text-foreground font-medium">Hours</span>
                          <span className="text-sm text-muted-foreground font-mono">
                            {(totalMins / 60).toFixed(1)} / {proratedHourTarget.toFixed(1)}h
                            <span className="ml-1.5 text-foreground font-semibold">{Math.round(hourProgress)}%</span>
                          </span>
                        </div>
                        <Progress value={hourProgress} className="h-2 rounded-full" />
                      </div>
                    )}
                    {proratedRevenueTarget > 0 && (
                      <div>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-sm text-foreground font-medium">Revenue</span>
                          <span className="text-sm text-muted-foreground font-mono">
                            €{billableValue.toFixed(0)} / €{proratedRevenueTarget.toFixed(0)}
                            <span className="ml-1.5 text-foreground font-semibold">{Math.round(revenueProgress)}%</span>
                          </span>
                        </div>
                        <Progress value={revenueProgress} className="h-2 rounded-full" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="relative">
                    <div className="blur-[6px] opacity-40 pointer-events-none select-none space-y-3">
                      <div>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-sm text-foreground font-medium">Hours</span>
                          <span className="text-sm text-muted-foreground font-mono">0.0 / 8.0h <span className="ml-1.5 text-foreground font-semibold">0%</span></span>
                        </div>
                        <Progress value={0} className="h-2 rounded-full" />
                      </div>
                      <div>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-sm text-foreground font-medium">Revenue</span>
                          <span className="text-sm text-muted-foreground font-mono">€0 / €3,000 <span className="ml-1.5 text-foreground font-semibold">0%</span></span>
                        </div>
                        <Progress value={0} className="h-2 rounded-full" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}




          {/* ── 6. Daily Breakdown Stacked Bar ── */}
          {stackedChartData.length > 0 && rangeEntries.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Daily Breakdown</h3>
              <div className="w-full" style={{ minHeight: 200 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stackedChartData} barCategoryGap="12%" margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      height={44}
                      interval={stackedChartData.length > 14 ? Math.ceil(stackedChartData.length / 10) - 1 : 0}
                      tickMargin={4}
                      tick={renderCompactDateTick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}h`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      formatter={(value: number, name: string) => {
                        const label = name === "unassigned" ? "Unassigned" : (clients[name] ?? name);
                        return [`${value.toFixed(1)}h`, label];
                      }}
                    />
                    {(clientFilter ? [clientFilter] : clientIds).map((cid, i) => (
                      <Bar key={cid} dataKey={cid} stackId="a" fill={clientColorMap[cid] ?? getClientColor(cid)}
                        radius={i === (clientFilter ? 0 : clientIds.length - 1) && !hasUnassigned ? [3, 3, 0, 0] : undefined}
                        name={cid} />
                    ))}
                    {!clientFilter && hasUnassigned && (
                      <Bar dataKey="unassigned" stackId="a" fill="hsl(240 5% 75%)" radius={[3, 3, 0, 0]} name="unassigned" />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Invoice History ── */}
          {invoices.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Invoice History</h3>
              <div className="space-y-1">
                {invoices.map((inv) => (
                  <div key={inv.id} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border border-border ${inv.status === "void" ? "opacity-50 line-through" : ""}`}>
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
                        <button className="text-xs text-foreground font-medium hover:underline" onClick={() => handleMarkPaid(inv.id)}>Paid</button>
                        <button className="text-xs text-destructive hover:underline" onClick={() => handleVoidInvoice(inv.id)}>Void</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export */}
          <div className="mb-6">
            <Button variant="outline" className="w-full gap-2 rounded-xl h-11" onClick={() => setExportOpen(true)}>
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>

          {/* Trash */}
          {showTrash ? (
            <TrashView onBack={() => setShowTrash(false)} onCountChange={(c) => setTrashCount(c)} />
          ) : trashCount > 0 ? (
            <div className="flex justify-center py-4">
              <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowTrash(true)}>
                <Trash2 className="w-4 h-4" />
                Trash · {trashCount} {trashCount === 1 ? "entry" : "entries"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modals */}
      <EntryDetailSheet entry={selectedEntry} open={detailOpen} onOpenChange={setDetailOpen} onEdit={handleEdit} onDeleted={() => loadData()} />
      <AssignmentModal open={assignOpen} session={editSession} existingEntry={editEntry}
        onSave={handleEditSave} onSkip={() => { setAssignOpen(false); setEditEntry(null); }}
        onDelete={async (entryId) => {
          await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entryId);
          toast("Entry deleted.");
          setAssignOpen(false);
          setEditEntry(null);
          loadData();
        }} />
      <BillingDialog open={billingOpen} onOpenChange={(v) => { setBillingOpen(v); if (!v) setBillingClientId(null); }} onComplete={loadData} rounding={rounding} preselectedClientId={billingClientId} />
      {prepareBillingClientId && (
        <PrepareBillingSheet
          open={prepareBillingOpen}
          onOpenChange={(v) => { setPrepareBillingOpen(v); if (!v) setPrepareBillingClientId(null); }}
          clientId={prepareBillingClientId}
          clientName={clients[prepareBillingClientId] ?? "Unknown"}
          clientCurrency={displayEntries.find(e => e.client_id === prepareBillingClientId)?.rate_currency ?? "EUR"}
          entries={displayEntries.filter(e => e.client_id === prepareBillingClientId)}
          rounding={rounding}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onComplete={loadData}
        />
      )}
      <PaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
      <UnassignedPanel
        open={unassignedOpen}
        onOpenChange={setUnassignedOpen}
        onAssignEntry={(entry) => {
          setUnassignedOpen(false);
          setEditEntry(entry as ExistingEntry);
          setEditSession({ durationMinutes: entry.duration_minutes, breakMinutes: entry.break_minutes ?? 0, startedAt: null, entryType: entry.entry_type ?? "timer" });
          setAssignOpen(true);
        }}
        onCountChange={() => {}}
      />
      <BoostOverlay
        open={boostOpen}
        onOpenChange={setBoostOpen}
        hourProgress={hourProgress}
        revenueProgress={revenueProgress}
        onStartSession={() => {
          markBoostCompleted();
          navigate("/?boost=1");
        }}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        dateFrom={dateFrom}
        dateTo={dateTo}
        weekStartsOn={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
        entries={rangeEntries}
        clients={clients}
        projects={projects}
        tasks={tasks}
        clientFilter={clientFilter}
        clientIds={clientIds}
        rounding={rounding}
      />
    </div>
  );
};

export default ReportsPage;
