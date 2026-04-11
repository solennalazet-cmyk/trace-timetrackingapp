import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Flame, Crown, Clock, Timer, PenLine, Phone, ChevronRight } from "lucide-react";
import { startOfWeek, format, differenceInDays } from "date-fns";
import DateRangePicker from "@/components/DateRangePicker";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey, getClientColor } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import EntryDetailSheet, { type TimeEntry } from "@/components/EntryDetailSheet";
import AssignmentModal, { type SessionData, type AssignmentResult, type ExistingEntry } from "@/components/AssignmentModal";
import PaywallModal from "@/components/PaywallModal";
import { toast } from "sonner";

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getDateLabel = (dateStr: string): string => {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" });
};

const TimelinePage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.plan === "pro" || profile?.plan === "trial";

  // Date range - default last 7 days
  const [from, setFrom] = useState(() => new Date(Date.now() - 6 * 86400000));
  const [to, setTo] = useState(() => new Date());

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Detail / edit
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ExistingEntry | null>(null);
  const [editSession, setEditSession] = useState<SessionData | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const rangeStart = toLocalDateKey(from);
  const rangeEnd = toLocalDateKey(to);

  const handleRangeChange = (f: Date, t: Date) => {
    if (!isPro) {
      const days = differenceInDays(t, f);
      if (days > 7) {
        setPaywallOpen(true);
        return;
      }
    }
    setFrom(f);
    setTo(t);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    if (user) {
      const [{ data: e }, { data: c }] = await Promise.all([
        supabase.from("time_entries")
          .select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, billable_value, client_id, project_id, task_id, start_time, end_time, client:clients(id, name), project:projects(id, name), task:tasks(id, name)")
          .eq("user_id", user.id)
          .gte("entry_date", rangeStart)
          .lte("entry_date", rangeEnd)
          .is("deleted_at", null)
          .order("entry_date", { ascending: false }),
        supabase.from("clients").select("id, name").eq("user_id", user.id),
      ]);

      const clientMap: Record<string, string> = {};
      c?.forEach((x) => { clientMap[x.id] = x.name; });
      setClients(clientMap);

      setEntries((e ?? []).map((entry: any) => ({
        ...entry,
        client_name: (entry.client as any)?.name ?? undefined,
        project_name: (entry.project as any)?.name ?? undefined,
        task_name: (entry.task as any)?.name ?? undefined,
      })) as TimeEntry[]);
    } else {
      const all = getAnonymousEntries();
      const filtered = all.filter((e: any) => {
        const d = e.entry_date ?? "";
        return d >= rangeStart && d <= rangeEnd;
      });
      setEntries(filtered.map((e: any, i: number) => ({
        ...e, id: e.id ?? `anon-${i}`,
        client_name: undefined, project_name: undefined, task_name: undefined,
      })));
      setClients({});
    }
    setLoading(false);
  }, [user, rangeStart, rangeEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  // Hero stats
  const stats = useMemo(() => {
    const taskCount = entries.length;
    const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0);

    // Streak: consecutive days with entries ending today
    const dateSet = new Set(entries.map((e) => e.entry_date).filter(Boolean));
    let streak = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(today);
    while (true) {
      if (dateSet.has(toLocalDateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }

    return { taskCount, totalMinutes, streak };
  }, [entries]);

  // Client colors for legend
  const clientIds = useMemo(() =>
    [...new Set(entries.map((e) => e.client_id).filter(Boolean))] as string[]
  , [entries]);

  // Group by date
  const groupedEntries = useMemo(() => {
    const groups: { date: string; label: string; entries: TimeEntry[] }[] = [];
    const dateMap = new Map<string, TimeEntry[]>();
    entries.forEach((e) => {
      const d = e.entry_date ?? "unknown";
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d)!.push(e);
    });
    const sortedDates = [...dateMap.keys()].sort((a, b) => b.localeCompare(a));
    sortedDates.forEach((d) => {
      groups.push({ date: d, label: getDateLabel(d), entries: dateMap.get(d)! });
    });
    return groups;
  }, [entries]);

  // Insights (Pro only)
  const insights = useMemo(() => {
    if (entries.length === 0) return null;

    // Most productive day of week by task count
    const dayCount: Record<number, number> = {};
    entries.forEach((e) => {
      if (!e.entry_date) return;
      const dow = new Date(e.entry_date + "T00:00:00").getDay();
      dayCount[dow] = (dayCount[dow] || 0) + 1;
    });
    let bestDay = 0, bestCount = 0;
    Object.entries(dayCount).forEach(([d, c]) => {
      if (c > bestCount) { bestDay = parseInt(d); bestCount = c; }
    });

    // Average session duration
    const avgDuration = Math.round(entries.reduce((s, e) => s + e.duration_minutes, 0) / entries.length);

    // Longest session
    const longestSession = Math.max(...entries.map((e) => e.duration_minutes));

    return {
      mostProductiveDay: WEEKDAYS[bestDay],
      mostProductiveDayCount: bestCount,
      avgDuration,
      longestSession,
    };
  }, [entries]);

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
      const shouldResetBilling =
        editEntry.client_id !== assignment.clientId ||
        editEntry.project_id !== assignment.projectId ||
        editEntry.task_id !== assignment.taskId ||
        (editEntry.billable ?? true) !== assignment.billable ||
        editEntry.rate_amount !== assignment.rateAmount ||
        (editEntry.rate_currency ?? "EUR") !== assignment.rateCurrency ||
        (editEntry.rate_unit ?? null) !== (assignment.rateAmount != null ? assignment.rateUnit : null);

      await supabase.from("time_entries").update({
        client_id: assignment.clientId, project_id: assignment.projectId,
        task_id: assignment.taskId,
        notes: assignment.notes || null, tags: assignment.tags.length ? assignment.tags : null,
        billable: assignment.billable, rate_amount: assignment.rateAmount,
        rate_currency: assignment.rateCurrency, rate_unit: assignment.rateAmount != null ? assignment.rateUnit : null,
        billable_value: assignment.billableValue,
        ...(shouldResetBilling ? { billing_status: "unbilled", invoice_id: null } : {}),
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

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">Loading…</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
        <CheckSquare className="w-12 h-12 text-muted-foreground opacity-30" />
        <p className="text-muted-foreground text-sm text-center">Your completed tasks will appear here.<br />Start the timer to log your first session.</p>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 px-6 font-bold" onClick={() => navigate("/")}>
          Start tracking →
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-24 px-4">
      {/* Date range picker */}
      <div className="mb-4">
        <DateRangePicker from={from} to={to} onChange={handleRangeChange} />
      </div>

      {/* Client color legend */}
      {clientIds.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {clientIds.map((cid) => (
            <div key={cid} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: getClientColor(cid) }} />
              {clients[cid] ?? "Unknown"}
            </div>
          ))}
        </div>
      )}

      {/* Hero stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl bg-muted/50 px-3 py-3 text-center">
          <p className="font-mono text-xl font-bold text-foreground">{stats.taskCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Tasks done</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-3 text-center">
          <p className="font-mono text-xl font-bold text-foreground">{formatHHMM(stats.totalMinutes)}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total time</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Flame className="w-4 h-4 text-orange-500" />
            <p className="font-mono text-xl font-bold text-foreground">{stats.streak}</p>
          </div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Day streak</p>
        </div>
      </div>

      {/* Task list grouped by day */}
      {groupedEntries.map((group) => (
        <div key={group.date} className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
            <p className="text-[10px] text-muted-foreground">{group.entries.length} task{group.entries.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="space-y-1">
            {group.entries.map((entry) => (
              <button
                key={entry.id}
                className="flex items-center w-full text-left px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors gap-3"
                onClick={() => { setSelectedEntry(entry); setDetailOpen(true); }}
              >
                <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                {entry.client_id && (
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getClientColor(entry.client_id) }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.task_name
                      ? entry.task_name
                      : entry.project_name
                        ? entry.project_name
                        : entry.client_name
                          ? entry.client_name
                          : <span className="text-muted-foreground">Unassigned</span>}
                  </p>
                  {entry.task_name && entry.project_name && (
                    <p className="text-xs text-muted-foreground truncate">{entry.project_name}</p>
                  )}
                </div>
                <span className="font-mono text-sm font-semibold text-foreground shrink-0">{formatHHMM(entry.duration_minutes)}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Insights section */}
      {insights && (
        <div className="relative mt-6 mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Insights</h3>
          <div className={isPro ? "" : "pointer-events-none select-none"}>
            <div className={isPro ? "" : "opacity-30 blur-[2px]"}>
              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-xl bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-foreground">Most productive day</span>
                  <span className="font-semibold text-foreground">{insights.mostProductiveDay} <span className="text-xs text-muted-foreground">({insights.mostProductiveDayCount} tasks)</span></span>
                </div>
                <div className="rounded-xl bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-foreground">Avg. session</span>
                  <span className="font-mono font-semibold text-foreground">{formatHHMM(insights.avgDuration)}</span>
                </div>
                <div className="rounded-xl bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-foreground">Longest session</span>
                  <span className="font-mono font-semibold text-foreground">{formatHHMM(insights.longestSession)}</span>
                </div>
              </div>
            </div>
          </div>
          {!isPro && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl mt-6">
              <button
                onClick={() => setPaywallOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg"
              >
                <Crown className="w-4 h-4" />
                Unlock Insights
              </button>
            </div>
          )}
        </div>
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

      <PaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default TimelinePage;
