import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Sector as RechartsSector,
} from "recharts";
import {
  ChevronDown, ChevronUp, Timer, PenLine, Clock, Phone,
  Crown, Download, Trash2, X,
} from "lucide-react";
import { startOfWeek, startOfMonth } from "date-fns";
import DateRangePicker from "@/components/DateRangePicker";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import EntryDetailSheet, { type TimeEntry } from "@/components/EntryDetailSheet";
import AssignmentModal, { type SessionData, type AssignmentResult, type ExistingEntry } from "@/components/AssignmentModal";
import BillingDialog from "@/components/BillingDialog";
import PaywallModal from "@/components/PaywallModal";
import ClientBillingSummary from "@/components/ClientBillingSummary";
import UnassignedPanel from "@/components/UnassignedPanel";
import TrashView from "@/components/TrashView";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

// Sunrise palette – harmonises with the brand gradient (golden → rose → violet → blue)
const SUNRISE_PALETTE = [
  "hsl(38 92% 55%)",   // warm amber
  "hsl(22 88% 55%)",   // burnt orange
  "hsl(340 72% 55%)",  // rose
  "hsl(310 60% 52%)",  // magenta
  "hsl(270 58% 58%)",  // violet
  "hsl(220 75% 58%)",  // blue
  "hsl(190 70% 48%)",  // teal
  "hsl(355 68% 52%)",  // coral
  "hsl(50 85% 52%)",   // gold
  "hsl(285 55% 52%)",  // purple
];

// Deterministic color for a client ID – stays the same across sessions
const hashStringToIndex = (str: string, max: number): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
};

const getClientColor = (clientId: string): string =>
  SUNRISE_PALETTE[hashStringToIndex(clientId, SUNRISE_PALETTE.length)];

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const [weekday, ...rest] = String(payload?.value ?? "").split(" ");
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="11">
        <tspan x={0} dy={12}>{weekday}</tspan>
        <tspan x={0} dy={10}>{rest.join(" ")}</tspan>
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
  const [defaultRange, setDefaultRange] = useState("monthly");

  // Settings are loaded inside the date initialization effect below

  // Initialize dates based on default range
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [datesInitialized, setDatesInitialized] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(new Date());
  const [dateTo, setDateTo] = useState<Date>(new Date());

  // Mark settings as loaded after fetch
  useEffect(() => {
    if (!user) { setSettingsLoaded(true); return; }
    supabase.from("user_settings")
      .select("daily_hour_target, revenue_target, week_start_day, default_report_range")
      .eq("user_id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setDailyHourTarget((data as any).daily_hour_target ?? 0);
          setRevenueTarget((data as any).revenue_target ?? 0);
          setWeekStartDay((data as any).week_start_day ?? 1);
          setDefaultRange((data as any).default_report_range ?? "monthly");
        }
        setSettingsLoaded(true);
      });
  }, [user]);

  useEffect(() => {
    if (datesInitialized || !settingsLoaded) return;
    const now = new Date();
    let from: Date;
    let to: Date = now;

    const wsd = weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    if (defaultRange === "monthly") {
      from = startOfMonth(now);
    } else if (defaultRange === "biweekly") {
      from = new Date(now.getTime() - 13 * 86400000);
    } else {
      from = startOfWeek(now, { weekStartsOn: wsd });
      const endOfWk = new Date(from);
      endOfWk.setDate(endOfWk.getDate() + 6);
      to = endOfWk;
    }
    setDateFrom(from);
    setDateTo(to);
    setDatesInitialized(true);
  }, [defaultRange, weekStartDay, datesInitialized, settingsLoaded]);

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
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [activeTimeIdx, setActiveTimeIdx] = useState<number | undefined>(undefined);
  const [activeTurnIdx, setActiveTurnIdx] = useState<number | undefined>(undefined);

  const rangeStart = toLocalDateKey(dateFrom);
  const rangeEnd = toLocalDateKey(dateTo);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (user) {
      const entrySelect = "id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, billable_value, client_id, project_id, task_id, billing_status, client:clients(id, name), project:projects(id, name), task:tasks(id, name)";
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

  // Core metrics
  const totalMins = displayEntries.reduce((s, e) => s + e.duration_minutes, 0);
  const billableMins = displayEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration_minutes, 0);
  const nonBillableMins = totalMins - billableMins;
  const billableValue = displayEntries.reduce((s, e) => s + (e.billable_value || 0), 0);

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
        projectMins[pKey] = (projectMins[pKey] || 0) + e.duration_minutes;
        if (e.project_id && !seenProjects.has(e.project_id)) { seenProjects.add(e.project_id); projectCount++; }
        const tKey = e.task_id ?? "no-task";
        taskMins[tKey] = (taskMins[tKey] || 0) + e.duration_minutes;
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
      map[key] = (map[key] || 0) + e.duration_minutes;
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
  }, [displayEntries, clientIds, clients, clientFilter, projects, tasks]);

  // Turnover donut: per-client billable value (always by client, even when filtered)
  const turnoverDonutData = useMemo(() => {
    const data: { name: string; initials: string; value: number; fill: string }[] = [];
    const map: Record<string, number> = {};
    displayEntries.forEach((e) => {
      if (!e.client_id || !e.billable_value) return;
      map[e.client_id] = (map[e.client_id] || 0) + e.billable_value;
    });
    clientIds.forEach((id) => {
      if (map[id]) {
        const name = clients[id] ?? "Unknown";
        const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
        data.push({ name, initials, value: map[id], fill: getClientColor(id) });
      }
    });
    return data;
  }, [displayEntries, clientIds, clients]);

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
        _total: dayEntries.reduce((s, e) => s + e.duration_minutes / 60, 0),
      };
      chartClientIds.forEach((cid) => {
        row[cid] = dayEntries.filter((e) => e.client_id === cid).reduce((s, e) => s + e.duration_minutes / 60, 0);
      });
      if (!clientFilter) {
        const un = dayEntries.filter((e) => !e.client_id).reduce((s, e) => s + e.duration_minutes / 60, 0);
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
              className="shrink-0 px-2 py-1.5 text-xs text-primary hover:underline"
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
              <Crown className="w-8 h-8 text-primary mx-auto mb-3" />
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
                  <div className="relative" style={{ width: 175, height: 175 }}>
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
                      <span className="text-base font-bold font-mono text-foreground">{formatHHMM(totalMins)}</span>
                      <span className="text-xs text-muted-foreground">{clientFilter ? (timeDonutData.some(d => d.name !== "No task" && d.name !== "No project") ? (displayEntries.filter(e => e.project_id).length > 0 && new Set(displayEntries.map(e => e.project_id).filter(Boolean)).size > 1 ? "by project" : "by task") : "time") : "time"}</span>
                    </div>
                  </div>

                  {/* Turnover donut */}
                  {turnoverDonutData.length > 0 && (
                    <div className="relative" style={{ width: 175, height: 175 }}>
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
                  setBillingClientId(clientId);
                  setBillingOpen(true);
                }}
                onOpenUnassigned={() => setUnassignedOpen(true)}
                onEditEntry={handleEdit}
                activeClientFilter={clientFilter}
                onFilterClient={(id) => setClientFilter(id ?? "")}
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
            const ENTRY_TYPE_COLORS: Record<string, string> = {
              stopwatch: "hsl(220 75% 58%)",  // blue
              manual: "hsl(38 92% 55%)",      // amber
              shift: "hsl(270 58% 58%)",      // violet
              focus: "hsl(340 72% 55%)",      // rose
              call: "hsl(22 88% 55%)",        // burnt orange
            };
            const ENTRY_TYPE_LABELS: Record<string, string> = {
              stopwatch: "Stopwatch",
              manual: "Manual",
              shift: "Shift",
              focus: "Focus",
              call: "Call Log",
            };
            const ENTRY_TYPE_ICONS: Record<string, React.ReactNode> = {
              stopwatch: <Timer className="w-3 h-3" />,
              manual: <PenLine className="w-3 h-3" />,
              shift: <Clock className="w-3 h-3" />,
              focus: <Phone className="w-3 h-3" />,
              call: <Phone className="w-3 h-3" />,
            };

            // Aggregate by entry type
            const byType: Record<string, { mins: number; value: number; count: number }> = {};
            displayEntries.forEach((e) => {
              const t = e.entry_type ?? "stopwatch";
              if (!byType[t]) byType[t] = { mins: 0, value: 0, count: 0 };
              byType[t].mins += e.duration_minutes;
              byType[t].value += e.billable_value || 0;
              byType[t].count += 1;
            });

            const types = Object.keys(byType);
            if (types.length === 0) return null;

            const hoursData = types.map((t) => ({ name: ENTRY_TYPE_LABELS[t] ?? t, value: byType[t].mins, fill: ENTRY_TYPE_COLORS[t] ?? "hsl(var(--muted-foreground))" }));
            const turnoverData = types.map((t) => ({ name: ENTRY_TYPE_LABELS[t] ?? t, value: byType[t].value, fill: ENTRY_TYPE_COLORS[t] ?? "hsl(var(--muted-foreground))" })).filter((d) => d.value > 0);
            const avgData = types.map((t) => ({ name: ENTRY_TYPE_LABELS[t] ?? t, value: byType[t].count > 0 ? Math.round(byType[t].mins / byType[t].count) : 0, fill: ENTRY_TYPE_COLORS[t] ?? "hsl(var(--muted-foreground))" }));

            const totalTurnover = turnoverData.reduce((s, d) => s + d.value, 0);

            const MiniDonut = ({ data, centerLabel, centerSub, size = 120 }: { data: { name: string; value: number; fill: string }[]; centerLabel: string; centerSub: string; size?: number }) => (
              <div className="relative shrink-0" style={{ width: size, height: size }}>
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
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Entry Type</h3>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
                  <div className="shrink-0 flex flex-col items-center">
                    <MiniDonut data={hoursData} centerLabel={formatHHMM(totalMins)} centerSub="hours" />
                    <span className="text-xs text-muted-foreground mt-1">Hours</span>
                  </div>
                  {turnoverData.length > 0 && (
                    <div className="shrink-0 flex flex-col items-center">
                      <MiniDonut data={turnoverData} centerLabel={`€${totalTurnover.toFixed(0)}`} centerSub="turnover" />
                      <span className="text-xs text-muted-foreground mt-1">Turnover</span>
                    </div>
                  )}
                  <div className="shrink-0 flex flex-col items-center">
                    <MiniDonut data={avgData} centerLabel={formatHHMM(Math.round(totalMins / (displayEntries.length || 1)))} centerSub="avg" />
                    <span className="text-xs text-muted-foreground mt-1">Avg Session</span>
                  </div>
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
          {(proratedHourTarget > 0 || proratedRevenueTarget > 0) && (
            <div className="mb-6 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goals</h3>
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
            </div>
          )}




          {/* ── 6. Daily Breakdown Stacked Bar ── */}
          {stackedChartData.length > 0 && rangeEntries.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Daily Breakdown</h3>
              <div className="w-full" style={{ minHeight: 200 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stackedChartData} barCategoryGap="12%" margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      height={42}
                      interval={0}
                      minTickGap={0}
                      tickMargin={6}
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
                        <button className="text-xs text-primary hover:underline" onClick={() => handleMarkPaid(inv.id)}>Paid</button>
                        <button className="text-xs text-destructive hover:underline" onClick={() => handleVoidInvoice(inv.id)}>Void</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export */}
          <div className="flex gap-2 mb-6">
            <Button variant="outline" className="flex-1 gap-1 rounded-xl" onClick={handleExportCSV}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button variant="outline" className="flex-1 gap-1 rounded-xl" onClick={() => toast.info("PDF export coming soon.")}>
              <Download className="w-4 h-4" /> Export PDF
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
      <BillingDialog open={billingOpen} onOpenChange={setBillingOpen} onComplete={loadData} />
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
    </div>
  );
};

export default ReportsPage;
