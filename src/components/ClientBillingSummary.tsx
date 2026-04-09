import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ArrowRight, Trash2, X } from "lucide-react";
import { type TimeEntry } from "@/components/EntryDetailSheet";
import { type RoundingSettings, DEFAULT_ROUNDING, roundDuration, roundedBillableValue } from "@/lib/rounding";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatHM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
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
  activeClientFilter,
  onFilterClient,
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

    Object.values(clientMap).forEach((c) => {
      c.entries.sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""));
    });
    unassignedEntries.sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""));

    return {
      clientSummaries: Object.values(clientMap).sort((a, b) => b.totalMins - a.totalMins),
      unassignedSummary: { totalMins: unassignedMins, entries: unassignedEntries },
    };
  }, [allEntries, clients]);

  // Calculate days in range for avg/day
  const daysInRange = useMemo(() => {
    const [sY, sM, sD] = rangeStart.split("-").map(Number);
    const [eY, eM, eD] = rangeEnd.split("-").map(Number);
    const start = new Date(sY, sM - 1, sD);
    const end = new Date(eY, eM - 1, eD);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }, [rangeStart, rangeEnd]);

  const toggleExpand = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (allEntries.length === 0) {
    return (
      <div className="mb-4">
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No entries for this period.</p>
          <p className="text-xs text-muted-foreground mt-1">Start tracking to see your billing summary.</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="space-y-2">
      {clientSummaries.map((c, i) => {
        const sym = CURRENCY_SYMBOLS[c.currency] ?? "€";
        const isExpanded = expandedClients.has(c.id);
        const avgPerDay = c.totalMins / daysInRange;
        const color = clientColorMap?.[c.id] ?? getClientColor(c.id);

        return (
          <div
            key={c.id}
            className={`rounded-2xl border overflow-hidden transition-all ${
              activeClientFilter === c.id ? "border-primary ring-1 ring-primary/30" : "border-border/60"
            }`}
            style={{ background: "hsl(var(--card))" }}
          >
            {/* Card header — clickable to expand */}
            <button
              onClick={() => toggleExpand(c.id)}
              className="w-full text-left p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-semibold text-foreground">{c.name}</span>
                </div>
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </div>

              {/* Key metrics row */}
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="text-lg font-bold font-mono text-foreground">{formatHM(c.totalMins)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-mono text-foreground">{sym}{c.billableValue.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">Billable</p>
                </div>
                <div>
                  <p className="text-sm font-medium font-mono text-muted-foreground">{formatHM(Math.round(avgPerDay))}</p>
                  <p className="text-xs text-muted-foreground">Avg/day</p>
                </div>
              </div>
            </button>

            {/* Expanded: sessions + billing */}
            {isExpanded && (
              <div className="border-t border-border">
                {/* Actions row */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20">
                  <button
                    onClick={() => onFilterClient?.(activeClientFilter === c.id ? null : c.id)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {activeClientFilter === c.id ? "Clear filter" : "Filter charts"}
                  </button>
                  <div className="flex items-center gap-3">
                    {c.outstanding > 0 && (
                      <span className="text-[11px] text-muted-foreground">{sym}{c.outstanding.toFixed(0)} outstanding</span>
                    )}
                    {isPro && c.outstanding > 0 && (
                      <button
                        onClick={() => onBillClient(c.id)}
                        className="text-[11px] font-medium flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-primary/15 text-foreground hover:bg-primary/25 transition-colors"
                      >
                        Bill client <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Session list */}
                <div className="max-h-60 overflow-y-auto">
                  {c.entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => onEditEntry?.(entry)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors text-left"
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
                              <span className="ml-1 text-primary font-medium">unbilled</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned */}
      {unassignedSummary.entries.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => toggleExpand("__unassigned__")}
            className="w-full text-left p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: "hsl(240 5% 75%)" }} />
                <span className="text-sm font-semibold text-foreground">Unassigned</span>
              </div>
              {expandedClients.has("__unassigned__")
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </div>
            <p className="text-lg font-bold font-mono text-foreground">{formatHM(unassignedSummary.totalMins)}</p>
            <p className="text-[10px] text-muted-foreground">Not billable</p>
          </button>

          {expandedClients.has("__unassigned__") && (
            <div className="border-t border-border">
              <div className="flex justify-end px-4 py-2.5 bg-muted/20">
                <button
                  onClick={onOpenUnassigned}
                  className="text-[11px] font-medium flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-primary/15 text-foreground hover:bg-primary/25 transition-colors"
                >
                  Assign entries <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {unassignedSummary.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-4 py-2.5 text-xs border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
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
                      </span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-foreground">{formatHM(entry.duration_minutes)}</span>
                      {onDeleteEntry && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteEntry(entry.id); }}
                          className="p-1 rounded hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientBillingSummary;
