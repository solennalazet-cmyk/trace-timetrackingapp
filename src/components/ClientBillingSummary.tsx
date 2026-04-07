import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ArrowRight, Trash2 } from "lucide-react";
import { type TimeEntry } from "@/components/EntryDetailSheet";
import { toLocalDateKey } from "@/lib/utils";

const CLIENT_COLORS = [
  "hsl(45 93% 58%)", "hsl(200 80% 55%)", "hsl(340 75% 55%)", "hsl(150 60% 45%)",
  "hsl(270 60% 60%)", "hsl(25 90% 55%)", "hsl(180 50% 45%)", "hsl(0 70% 55%)",
];

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatHM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
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

interface ClientBillingSummaryProps {
  allEntries: TimeEntry[];
  clients: Record<string, string>;
  projects: Record<string, string>;
  isPro: boolean;
  clientColorMap?: Record<string, string>;
  rangeStart: string;
  rangeEnd: string;
  rangeLabel: string;
  onBillClient: (clientId: string) => void;
  onOpenUnassigned: () => void;
  onEditEntry?: (entry: TimeEntry) => void;
  onDeleteEntry?: (entryId: string) => void;
  activeClientFilter?: string;
  onFilterClient?: (clientId: string | null) => void;
}

interface ClientSummary {
  id: string;
  name: string;
  totalMins: number;
  billableMins: number;
  billableValue: number;
  outstanding: number;
  currency: string;
  entries: TimeEntry[];
}

const ClientBillingSummary = ({
  allEntries,
  clients,
  projects,
  isPro,
  clientColorMap,
  rangeStart,
  rangeEnd,
  rangeLabel,
  onBillClient,
  onOpenUnassigned,
  onEditEntry,
  onDeleteEntry,
}: ClientBillingSummaryProps) => {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const { clientSummaries, unassignedSummary } = useMemo(() => {
    const clientMap: Record<string, ClientSummary> = {};
    let unassignedMins = 0;
    const unassignedEntries: TimeEntry[] = [];

    allEntries.forEach((e) => {
      if (!e.client_id) {
        unassignedMins += e.duration_minutes;
        unassignedEntries.push(e);
        return;
      }

      if (!clientMap[e.client_id]) {
        clientMap[e.client_id] = {
          id: e.client_id,
          name: clients[e.client_id] ?? "Unknown",
          totalMins: 0,
          billableMins: 0,
          billableValue: 0,
          outstanding: 0,
          currency: e.rate_currency ?? "EUR",
          entries: [],
        };
      }
      const c = clientMap[e.client_id];
      c.totalMins += e.duration_minutes;
      c.entries.push(e);
      if (e.billable) {
        c.billableMins += e.duration_minutes;
        c.billableValue += e.billable_value || 0;
        if (e.billing_status === "unbilled") {
          c.outstanding += e.billable_value || 0;
        }
      }
    });

    // Sort entries reverse chronological
    Object.values(clientMap).forEach((c) => {
      c.entries.sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""));
    });
    unassignedEntries.sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""));

    return {
      clientSummaries: Object.values(clientMap).sort((a, b) => b.totalMins - a.totalMins),
      unassignedSummary: { totalMins: unassignedMins, entries: unassignedEntries },
    };
  }, [allEntries, clients]);

  // Daily breakdown
  const dailyBreakdown = useMemo(() => {
    const days = getDaysInRange(rangeStart, rangeEnd);
    const dayMap: Record<string, { mins: number; value: number }> = {};
    allEntries.forEach((e) => {
      const d = e.entry_date ?? "";
      if (!dayMap[d]) dayMap[d] = { mins: 0, value: 0 };
      dayMap[d].mins += e.duration_minutes;
      dayMap[d].value += e.billable_value || 0;
    });
    const totalMins = allEntries.reduce((s, e) => s + e.duration_minutes, 0);
    const totalValue = allEntries.reduce((s, e) => s + (e.billable_value || 0), 0);

    return {
      days: days.map((d) => {
        const dateObj = new Date(d + "T00:00:00");
        return {
          date: d,
          label: dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
          mins: dayMap[d]?.mins ?? 0,
          value: dayMap[d]?.value ?? 0,
        };
      }),
      totalMins,
      totalValue,
    };
  }, [allEntries, rangeStart, rangeEnd]);

  const toggleExpand = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (allEntries.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Client Summary</h3>
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No entries for this period.</p>
          <p className="text-xs text-muted-foreground mt-1">Start tracking to see your billing summary.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {/* Header */}
      <h3 className="text-sm font-semibold text-foreground mb-3">Client Summary</h3>

      {/* Client rows */}
      <div className="space-y-2">
        {clientSummaries.map((c, i) => {
          const sym = CURRENCY_SYMBOLS[c.currency] ?? "€";
          const isExpanded = expandedClients.has(c.id);

          return (
            <div key={c.id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Main row */}
              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: clientColorMap?.[c.id] ?? CLIENT_COLORS[i % CLIENT_COLORS.length] }} />
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                  </div>
                  <button onClick={() => toggleExpand(c.id)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    }
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatHM(c.totalMins)} total · {formatHM(c.billableMins)} billable
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-muted-foreground">
                    {sym}{c.billableValue.toFixed(2)} billable value · {sym}{c.outstanding.toFixed(2)} outstanding
                  </p>
                  {isPro && c.outstanding > 0 && (
                    <button
                      onClick={() => onBillClient(c.id)}
                      className="text-xs font-medium flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-primary/15 text-foreground hover:bg-primary/25 transition-colors"
                    >
                      Bill client <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded: session list (reverse chronological) */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/20 max-h-60 overflow-y-auto">
                  {c.entries.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No sessions</p>
                  ) : (
                    c.entries.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => onEditEntry?.(entry)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors text-left"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">
                            {new Date(entry.entry_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                          <span className="text-foreground font-medium">
                            {entry.project_name ?? "No project"}
                            {entry.task_name ? ` · ${entry.task_name}` : ""}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-foreground">{formatHM(entry.duration_minutes)}</span>
                          {entry.billable && entry.billable_value ? (
                            <span className="font-mono text-muted-foreground">
                              {sym}{entry.billable_value.toFixed(2)}
                              {entry.billing_status === "unbilled" && (
                                <span className="ml-1 text-accent-foreground font-medium">unbilled</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned row — collapsible */}
        {unassignedSummary.entries.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "hsl(240 5% 75%)" }} />
                  <span className="text-sm font-medium text-foreground">Unassigned</span>
                </div>
                <button onClick={() => toggleExpand("__unassigned__")} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  {expandedClients.has("__unassigned__")
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  }
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatHM(unassignedSummary.totalMins)} total · not billable
              </p>
              <div className="flex justify-end mt-1.5">
                <button
                  onClick={onOpenUnassigned}
                  className="text-xs font-medium flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-primary/15 text-foreground hover:bg-primary/25 transition-colors"
                >
                  Assign entries <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {expandedClients.has("__unassigned__") && (
              <div className="border-t border-border bg-muted/20 max-h-60 overflow-y-auto">
                {unassignedSummary.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-3 py-2 text-xs border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
                  >
                    <button
                      onClick={() => onEditEntry?.(entry)}
                      className="flex flex-col gap-0.5 text-left flex-1 min-w-0"
                    >
                      <span className="text-muted-foreground">
                        {new Date(entry.entry_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span className="text-foreground font-medium truncate">
                        {entry.project_name ?? "No project"}
                        {entry.task_name ? ` · ${entry.task_name}` : ""}
                      </span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-foreground">{formatHM(entry.duration_minutes)}</span>
                      {onDeleteEntry && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteEntry(entry.id); }}
                          className="p-1 rounded hover:bg-destructive/10 transition-colors"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Daily Breakdown */}
      <div className="mt-4">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Daily Breakdown</h4>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {dailyBreakdown.days.map((day) => (
            <div key={day.date} className="flex items-center justify-between px-3 py-2 text-xs border-b border-border last:border-b-0">
              <span className="text-muted-foreground">{day.label}</span>
              <div className="flex items-center gap-4">
                <span className={`font-mono ${day.mins > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {formatHM(day.mins)}
                </span>
                <span className={`font-mono w-16 text-right ${day.value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {day.value > 0 ? `€${day.value.toFixed(0)}` : "—"}
                </span>
              </div>
            </div>
          ))}
          {/* Total row */}
          <div className="flex items-center justify-between px-3 py-2.5 text-xs font-bold bg-muted/30 border-t border-border">
            <span className="text-foreground">{rangeLabel}</span>
            <div className="flex items-center gap-4">
              <span className="font-mono text-foreground">{formatHM(dailyBreakdown.totalMins)}</span>
              <span className="font-mono w-16 text-right text-foreground">
                {dailyBreakdown.totalValue > 0 ? `€${dailyBreakdown.totalValue.toFixed(0)}` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientBillingSummary;
