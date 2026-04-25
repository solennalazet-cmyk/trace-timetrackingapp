import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Flame, Crown, ChevronDown } from "lucide-react";
import { differenceInDays, format, isToday, isYesterday, parseISO } from "date-fns";
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
import { cn } from "@/lib/utils";

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

const formatHHMMmono = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ---------- Types ---------- */
interface TaskGroup {
  key: string;
  taskName: string;
  projectName: string | null;
  clientId: string | null;
  totalMinutes: number;
  sessions: TimeEntry[];
}

interface DaySection {
  dateKey: string;
  label: string;
  totalMinutes: number;
  taskGroups: TaskGroup[];
}

/* ---------- Day label helper ---------- */
const getDayLabel = (dateKey: string): string => {
  const d = parseISO(dateKey);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
};

/* ---------- Ink-fill checkbox ---------- */
const InkCheckbox = ({ checked, onToggle }: { checked: boolean; onToggle: () => void }) => {
  const [justFilled, setJustFilled] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!checked) {
      setJustFilled(true);
      setTimeout(() => setJustFilled(false), 450);
    }
    onToggle();
  };

  return (
    <button
      onClick={handleClick}
      className="shrink-0 flex items-center justify-center w-5 h-5 rounded-[4px] border border-primary/40 transition-colors duration-200 focus:outline-none"
      style={{
        backgroundColor: checked ? "hsl(var(--primary))" : "transparent",
      }}
    >
      {checked && (
        <CheckSquare
          className={cn(
            "w-4 h-4 text-primary-foreground",
            justFilled && "ink-fill-animate"
          )}
        />
      )}
    </button>
  );
};

const TimelinePage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.plan === "pro" || profile?.plan === "trial";

  const [from, setFrom] = useState(() => new Date(Date.now() - 6 * 86400000));
  const [to, setTo] = useState(() => new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

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
      if (days > 7) { setPaywallOpen(true); return; }
    }
    setFrom(f); setTo(t);
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
          .order("start_time", { ascending: true }),
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

  /* ---------- Group entries by day, then by task within each day ---------- */
  const daySections = useMemo((): DaySection[] => {
    // Group by date first
    const byDate = new Map<string, TimeEntry[]>();
    entries.forEach((e) => {
      const dk = e.entry_date ?? "unknown";
      if (!byDate.has(dk)) byDate.set(dk, []);
      byDate.get(dk)!.push(e);
    });

    // Sort dates descending (most recent first)
    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    return sortedDates.map((dateKey) => {
      const dayEntries = byDate.get(dateKey)!;
      const totalMinutes = dayEntries.reduce((s, e) => s + e.duration_minutes, 0);

      // Group by task within this day
      const taskMap = new Map<string, TaskGroup>();
      dayEntries.forEach((e) => {
        const key = e.task_id ?? e.project_id ?? "unassigned";
        const label = e.task_name ?? e.project_name ?? e.client_name ?? "Unassigned";

        if (!taskMap.has(key)) {
          taskMap.set(key, {
            key,
            taskName: label,
            projectName: e.task_name ? (e.project_name ?? null) : null,
            clientId: e.client_id ?? null,
            totalMinutes: 0,
            sessions: [],
          });
        }
        const group = taskMap.get(key)!;
        group.totalMinutes += e.duration_minutes;
        group.sessions.push(e);
      });

      // Sort tasks by total duration descending within this day
      const taskGroups = [...taskMap.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);

      return {
        dateKey,
        label: getDayLabel(dateKey),
        totalMinutes,
        taskGroups,
      };
    });
  }, [entries]);

  // Hero stats
  const stats = useMemo(() => {
    const allTaskKeys = new Set<string>();
    daySections.forEach((ds) => ds.taskGroups.forEach((g) => allTaskKeys.add(g.key)));
    const taskCount = allTaskKeys.size;
    const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0);
    const dateSet = new Set(entries.map((e) => e.entry_date).filter(Boolean));
    let streak = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(today);
    while (true) {
      if (dateSet.has(toLocalDateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return { taskCount, totalMinutes, streak };
  }, [entries, daySections]);

  const clientIds = useMemo(() =>
    [...new Set(entries.map((e) => e.client_id).filter(Boolean))] as string[]
  , [entries]);

  // Insights (Pro only)
  const insights = useMemo(() => {
    if (entries.length === 0) return null;
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
    const avgDuration = Math.round(entries.reduce((s, e) => s + e.duration_minutes, 0) / entries.length);
    const longestSession = Math.max(...entries.map((e) => e.duration_minutes));
    return { mostProductiveDay: WEEKDAYS[bestDay], mostProductiveDayCount: bestCount, avgDuration, longestSession };
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

  const toggleTaskComplete = (dayKey: string, taskKey: string) => {
    const compositeKey = `${dayKey}::${taskKey}`;
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(compositeKey)) next.delete(compositeKey);
      else next.add(compositeKey);
      return next;
    });
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
    <div className="pb-24">
      {/* Sticky top controls – full width, sits below the app header (56px) */}
      <div className="sticky top-0 z-40 -mx-4 px-4 pt-2 pb-3 bg-background/80 backdrop-blur-md border-b border-border/30">
        <div className="mb-2">
          <DateRangePicker from={from} to={to} onChange={handleRangeChange} />
        </div>

        {clientIds.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {clientIds.map((cid) => (
              <div key={cid} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: getClientColor(cid) }} />
                {clients[cid] ?? "Unknown"}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4">
        {/* Hero stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl bg-muted/50 px-3 py-3 text-center">
            <p className="font-mono text-xl font-bold text-foreground">{stats.taskCount}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Tasks</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-3 py-3 text-center">
            <p className="font-mono text-xl font-bold text-foreground">{formatHHMMmono(stats.totalMinutes)}</p>
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

        {/* Day sections */}
        <div className="space-y-6">
          {daySections.map((day) => (
            <section key={day.dateKey}>
              {/* Day header */}
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-foreground">{day.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {day.taskGroups.length} task{day.taskGroups.length !== 1 ? "s" : ""} · {formatHHMM(day.totalMinutes)}
                </p>
              </div>

              {/* Task cards for this day */}
              <div className="space-y-3">
                {day.taskGroups.map((group) => {
                  const compositeKey = `${day.dateKey}::${group.key}`;
                  const isExpanded = expandedTask === compositeKey;
                  const isComplete = completedTasks.has(compositeKey);

                  return (
                    <div
                      key={compositeKey}
                      className="rounded-xl bg-card border border-border shadow-sm overflow-hidden"
                    >
                      {/* Card header */}
                      <button
                        className="flex items-center w-full text-left px-4 py-4 gap-3"
                        onClick={() => setExpandedTask(isExpanded ? null : compositeKey)}
                      >
                        <InkCheckbox
                          checked={isComplete}
                          onToggle={() => toggleTaskComplete(day.dateKey, group.key)}
                        />

                        {group.clientId && (
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getClientColor(group.clientId) }} />
                        )}

                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium truncate transition-colors",
                            isComplete ? "line-through text-muted-foreground" : "text-foreground"
                          )}>
                            {group.taskName}
                          </p>
                          {group.projectName && (
                            <p className="text-xs text-muted-foreground/70 truncate">{group.projectName}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="font-mono text-sm font-bold text-foreground">{formatHHMM(group.totalMinutes)}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <ChevronDown className={cn(
                            "w-4 h-4 text-muted-foreground transition-transform duration-200",
                            isExpanded && "rotate-180"
                          )} />
                        </div>
                      </button>

                      {/* Expanded sessions */}
                      {isExpanded && (
                        <div className="border-t border-border/50 px-4 pb-3 pt-2">
                          <div className="space-y-1 ml-8">
                            {group.sessions.map((session) => {
                              const timeRange = session.start_time && session.end_time
                                ? `${new Date(session.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} → ${new Date(session.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                : session.entry_date ?? "";

                              return (
                                <button
                                  key={session.id}
                                  className="flex items-center w-full text-left py-2 px-2 rounded-md hover:bg-muted/40 transition-colors gap-3"
                                  onClick={() => { setSelectedEntry(session); setDetailOpen(true); }}
                                >
                                  <span className="text-xs text-muted-foreground/60 min-w-[100px]">
                                    {timeRange}
                                  </span>
                                  <span className="font-mono text-xs text-muted-foreground font-medium">
                                    {formatHHMM(session.duration_minutes)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

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
                    <span className="font-mono font-semibold text-foreground">{formatHHMMmono(insights.avgDuration)}</span>
                  </div>
                  <div className="rounded-xl bg-muted/50 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-foreground">Longest session</span>
                    <span className="font-mono font-semibold text-foreground">{formatHHMMmono(insights.longestSession)}</span>
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
      </div>

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
          toast("Entry deleted.", { duration: 2250 });
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
