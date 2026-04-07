import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { BarChart3, List, Search, Timer, PenLine, Clock, Phone, ChevronRight, Flame, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import EntryDetailSheet, { type TimeEntry } from "@/components/EntryDetailSheet";
import AssignmentModal, { type SessionData, type AssignmentResult, type ExistingEntry } from "@/components/AssignmentModal";
import { toast } from "sonner";

type ViewMode = "chart" | "list";
type DateRange = "today" | "7days" | "30days" | "month";
type EntryTypeFilter = "all" | "timer" | "manual" | "shift" | "call";
type BillableFilter = "all" | "billable" | "non-billable";

const RANGES: { key: DateRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7days", label: "7 days" },
  { key: "30days", label: "30 days" },
  { key: "month", label: "This month" },
];

const SUNRISE_PALETTE = [
  "hsl(38 92% 55%)", "hsl(22 88% 55%)", "hsl(340 72% 55%)", "hsl(310 60% 52%)",
  "hsl(270 58% 58%)", "hsl(220 75% 58%)", "hsl(190 70% 48%)", "hsl(355 68% 52%)",
  "hsl(50 85% 52%)", "hsl(285 55% 52%)",
];
const hashStringToIndex = (str: string, max: number): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash) % max;
};
const getClientColor = (id: string) => SUNRISE_PALETTE[hashStringToIndex(id, SUNRISE_PALETTE.length)];

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const getDateRangeStart = (range: DateRange): string => {
  const now = new Date();
  let d: Date;
  switch (range) {
    case "today": d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "7days": d = new Date(now.getTime() - 6 * 86400000); break;
    case "30days": d = new Date(now.getTime() - 29 * 86400000); break;
    case "month": d = new Date(now.getFullYear(), now.getMonth(), 1); break;
  }
  return toLocalDateKey(d);
};

const getDaysInRange = (startStr: string): string[] => {
  const days: string[] = [];
  const start = new Date(startStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(start);
  while (d <= today) {
    days.push(toLocalDateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
};

const getDateLabel = (dateStr: string): string => {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" });
};

const entryTypeIcon = (type: string | null) => {
  switch (type) {
    case "manual": return <PenLine className="w-4 h-4 text-muted-foreground" />;
    case "shift": return <Clock className="w-4 h-4 text-muted-foreground" />;
    case "call": return <Phone className="w-4 h-4 text-muted-foreground" />;
    default: return <Timer className="w-4 h-4 text-muted-foreground" />;
  }
};

const TimelinePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("chart");
  const [range, setRange] = useState<DateRange>("30days");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [tasks, setTasksMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // List view filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>("all");
  const [billableFilter, setBillableFilter] = useState<BillableFilter>("all");
  const [clientFilter, setClientFilter] = useState<string>("");

  // Detail / edit
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ExistingEntry | null>(null);
  const [editSession, setEditSession] = useState<SessionData | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const rangeStart = getDateRangeStart(range);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (user) {
      const [{ data: e }, { data: c }, { data: p }, { data: t }] = await Promise.all([
        supabase.from("time_entries")
          .select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, billable_value, client_id, project_id, task_id, client:clients(id, name), project:projects(id, name), task:tasks(id, name)")
          .eq("user_id", user.id)
          .gte("entry_date", rangeStart)
          .is("deleted_at", null)
          .order("entry_date", { ascending: false }),
        supabase.from("clients").select("id, name").eq("user_id", user.id),
        supabase.from("projects").select("id, name").eq("user_id", user.id),
        supabase.from("tasks").select("id, name").eq("user_id", user.id),
      ]);

      const clientMap: Record<string, string> = {};
      c?.forEach((x) => { clientMap[x.id] = x.name; });
      const projectMap: Record<string, string> = {};
      p?.forEach((x) => { projectMap[x.id] = x.name; });
      const taskMap: Record<string, string> = {};
      t?.forEach((x) => { taskMap[x.id] = x.name; });

      setClients(clientMap);
      setProjects(projectMap);
      setTasksMap(taskMap);

      setEntries((e ?? []).map((entry: any) => ({
        ...entry,
        client_name: (entry.client as any)?.name ?? undefined,
        project_name: (entry.project as any)?.name ?? undefined,
        task_name: (entry.task as any)?.name ?? undefined,
      })) as TimeEntry[]);
    } else {
      const all = getAnonymousEntries();
      const filtered = all.filter((e: any) => (e.entry_date ?? "") >= rangeStart);
      setEntries(filtered.map((e: any, i: number) => ({
        ...e, id: e.id ?? `anon-${i}`,
        client_name: undefined, project_name: undefined, task_name: undefined,
      })));
      setClients({}); setProjects({}); setTasksMap({});
    }
    setLoading(false);
  }, [user, rangeStart]);

  useEffect(() => { loadData(); }, [loadData]);

  // Streak calculation
  const streak = useMemo(() => {
    const dateSet = new Set(entries.map((e) => e.entry_date).filter(Boolean));
    let count = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(today);
    while (true) {
      const ds = toLocalDateKey(d);
      if (dateSet.has(ds)) { count++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return count;
  }, [entries]);

  // Chart data
  const chartData = useMemo(() => {
    const days = getDaysInRange(rangeStart);
    const clientIds = [...new Set(entries.map((e) => e.client_id).filter(Boolean))] as string[];
    const colorMap: Record<string, string> = {};
    clientIds.forEach((id, i) => { colorMap[id] = CLIENT_COLORS[i % CLIENT_COLORS.length]; });
    colorMap["unassigned"] = "hsl(240 5% 75%)";

    return days.map((day) => {
      const dayEntries = entries.filter((e) => e.entry_date === day);
      const row: any = { date: day, label: new Date(day + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
      clientIds.forEach((cid) => {
        row[cid] = dayEntries.filter((e) => e.client_id === cid).reduce((s, e) => s + e.duration_minutes / 60, 0);
      });
      const unassigned = dayEntries.filter((e) => !e.client_id).reduce((s, e) => s + e.duration_minutes / 60, 0);
      if (unassigned > 0) row["unassigned"] = unassigned;
      return row;
    });
  }, [entries, rangeStart]);

  const clientIds = [...new Set(entries.map((e) => e.client_id).filter(Boolean))] as string[];
  const hasUnassigned = entries.some((e) => !e.client_id);

  // List view filtering
  const filteredEntries = useMemo(() => {
    let result = entries;
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
  }, [entries, typeFilter, billableFilter, clientFilter, search]);

  // Group by date
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
      groups.push({ date: d, label: getDateLabel(d), entries: dateMap.get(d)! });
    });
    return groups;
  }, [filteredEntries]);

  const hasFilters = typeFilter !== "all" || billableFilter !== "all" || clientFilter !== "" || search !== "";

  const handleEdit = (entry: TimeEntry) => {
    setEditEntry(entry as ExistingEntry);
    setEditSession({
      durationMinutes: entry.duration_minutes,
      breakMinutes: entry.break_minutes ?? 0,
      startedAt: null,
      entryType: entry.entry_type ?? "timer",
    });
    setAssignOpen(true);
  };

  const handleEditSave = async (_session: SessionData, assignment: AssignmentResult) => {
    if (!editEntry || !user) return;
    try {
      await supabase.from("time_entries").update({
        client_id: assignment.clientId, project_id: assignment.projectId,
        task_id: assignment.taskId,
        notes: assignment.notes || null, tags: assignment.tags.length ? assignment.tags : null,
        billable: assignment.billable, rate_amount: assignment.rateAmount,
        rate_currency: assignment.rateCurrency, rate_unit: assignment.rateAmount ? assignment.rateUnit : null,
        billable_value: assignment.billableValue,
      }).eq("id", editEntry.id);
      toast.success("Entry updated.");
      setAssignOpen(false); setEditEntry(null); setEditSession(null);
      loadData();
    } catch {
      toast.error("Something went wrong. Try again.");
    }
  };

  const handleDeleted = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const clearFilters = () => {
    setSearch(""); setTypeFilter("all"); setBillableFilter("all"); setClientFilter("");
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">Loading…</div>;
  }

  // Empty states
  if (entries.length === 0 && !hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
        <Clock className="w-12 h-12 text-muted-foreground opacity-30" />
        <p className="text-muted-foreground text-sm text-center">Your timeline will appear here.<br />Start the timer to log your first session.</p>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 px-6 font-bold" onClick={() => navigate("/")}>
          Start tracking →
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-24 px-4">
      {/* Header row: range + view toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 overflow-x-auto">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className="px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors"
              style={{
                background: range === r.key ? "hsl(var(--primary))" : "transparent",
                color: range === r.key ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                border: range === r.key ? "none" : "1px solid hsl(var(--border))",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-2">
          <button onClick={() => setView("chart")} className="p-2 rounded-lg" style={{ color: view === "chart" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
            <BarChart3 className="w-5 h-5" />
          </button>
          <button onClick={() => setView("list")} className="p-2 rounded-lg" style={{ color: view === "list" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* CHART VIEW */}
      {view === "chart" && (
        <>
          {/* Streak */}
          {streak > 0 && (
            <div className="flex items-center gap-1.5 mb-3 text-sm font-medium text-foreground">
              <Flame className="w-4 h-4 text-orange-500" />
              {streak}-day streak
            </div>
          )}

          <div className="w-full overflow-x-auto mb-4" style={{ minHeight: 220 }}>
            <div style={{ minWidth: Math.max(chartData.length * 32, 300) }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barCategoryGap="20%">
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}h`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number, name: string) => [`${value.toFixed(1)}h`, name === "unassigned" ? "Unassigned" : (clients[name] ?? name)]}
                    labelFormatter={(label) => label}
                  />
                  {clientIds.map((cid, i) => (
                    <Bar key={cid} dataKey={cid} stackId="a" fill={CLIENT_COLORS[i % CLIENT_COLORS.length]} radius={i === clientIds.length - 1 && !hasUnassigned ? [3, 3, 0, 0] : undefined} name={clients[cid] ?? cid} />
                  ))}
                  {hasUnassigned && (
                    <Bar dataKey="unassigned" stackId="a" fill="hsl(240 5% 75%)" radius={[3, 3, 0, 0]} name="Unassigned" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4">
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

      {/* LIST VIEW */}
      {view === "list" && (
        <>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search entries..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap mb-3">
            {(["all", "timer", "manual", "shift", "call"] as EntryTypeFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className="px-3 py-1 text-xs font-medium rounded-full transition-colors"
                style={{
                  background: typeFilter === t ? "hsl(var(--primary))" : "transparent",
                  color: typeFilter === t ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  border: typeFilter === t ? "none" : "1px solid hsl(var(--border))",
                }}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap mb-3">
            {(["all", "billable", "non-billable"] as BillableFilter[]).map((b) => (
              <button
                key={b}
                onClick={() => setBillableFilter(b)}
                className="px-3 py-1 text-xs font-medium rounded-full transition-colors"
                style={{
                  background: billableFilter === b ? "hsl(var(--primary))" : "transparent",
                  color: billableFilter === b ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  border: billableFilter === b ? "none" : "1px solid hsl(var(--border))",
                }}
              >
                {b === "all" ? "All" : b === "billable" ? "Billable" : "Non-billable"}
              </button>
            ))}
            {Object.keys(clients).length > 0 && (
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="px-3 py-1 text-xs font-medium rounded-full border border-border bg-transparent text-muted-foreground"
              >
                <option value="">All clients</option>
                {Object.entries(clients).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-primary hover:underline">Clear all</button>
            )}
          </div>

          {/* Entries grouped by date */}
          {filteredEntries.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No entries match your search.</p>
              <button onClick={clearFilters} className="text-xs text-primary hover:underline mt-1">Clear filters</button>
            </div>
          )}

          {groupedEntries.map((group) => (
            <div key={group.date} className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.label}</p>
              <div className="space-y-1">
                {group.entries.map((entry) => (
                  <button
                    key={entry.id}
                    className="flex items-center w-full text-left px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors gap-3"
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

      {/* Entry Detail Sheet */}
      <EntryDetailSheet
        entry={selectedEntry}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDeleted={handleDeleted}
      />

      {/* Assignment Modal for editing */}
      <AssignmentModal
        open={assignOpen}
        session={editSession}
        existingEntry={editEntry}
        onSave={handleEditSave}
        onSkip={() => { setAssignOpen(false); setEditEntry(null); setEditSession(null); }}
        onDelete={async (entryId) => {
          await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entryId);
          toast("Entry deleted.");
          setAssignOpen(false);
          setEditEntry(null);
          setEditSession(null);
          loadData();
        }}
      />
    </div>
  );
};

export default TimelinePage;
