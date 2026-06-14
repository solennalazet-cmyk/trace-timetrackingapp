import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, ArrowRight, Trash2 } from "lucide-react";
import { type TimeEntry } from "@/components/EntryDetailSheet";
import { type RoundingSettings, DEFAULT_ROUNDING, aggregateWithRounding, entryDisplayValues } from "@/lib/rounding";

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
  rounding?: RoundingSettings;
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
const fallbackClientColor = (id: string) => SUNRISE_PALETTE[hashStringToIndex(id, SUNRISE_PALETTE.length)];

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

const ClientBillingSummary = ({
  allEntries,
  clients,
  isPro,
  clientColorMap,
  rangeStart,
  rangeEnd,
  onBillClient,
  onOpenUnassigned,
  onEditEntry,
  onDeleteEntry,
  activeClientFilter,
  rounding = DEFAULT_ROUNDING,
}: ClientBillingSummaryProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { clientSummaries, unassignedSummary } = useMemo(() => {
    const clientMap: Record<string, ClientSummary> = {};
    const unassignedEntries: TimeEntry[] = [];

    allEntries.forEach((e) => {
      if (!e.client_id) { unassignedEntries.push(e); return; }
      if (!clientMap[e.client_id]) {
        clientMap[e.client_id] = {
          id: e.client_id,
          name: clients[e.client_id] ?? "Unknown",
          totalMins: 0, billableMins: 0, billableValue: 0, outstanding: 0,
          currency: e.rate_currency ?? "EUR",
          entries: [],
        };
      }
      clientMap[e.client_id].entries.push(e);
    });

    Object.values(clientMap).forEach((c) => {
      const { totalMinutes } = aggregateWithRounding(c.entries, rounding);
      c.totalMins = totalMinutes;
      const billableEntries = c.entries.filter((e) => e.billable);
      const { totalMinutes: bMins, totalValue: bVal } = aggregateWithRounding(billableEntries, rounding);
      c.billableMins = bMins;
      c.billableValue = bVal;
      const unbilledEntries = c.entries.filter((e) => e.billable && e.billing_status === "unbilled");
      const { totalValue: outVal } = aggregateWithRounding(unbilledEntries, rounding);
      c.outstanding = outVal;
      c.entries.sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""));
    });

    const { totalMinutes: unassignedMins } = aggregateWithRounding(unassignedEntries, rounding);
    unassignedEntries.sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""));

    return {
      clientSummaries: Object.values(clientMap).sort((a, b) => b.billableValue - a.billableValue || b.totalMins - a.totalMins),
      unassignedSummary: { totalMins: unassignedMins, entries: unassignedEntries },
    };
  }, [allEntries, clients, rounding]);

  const daysInRange = useMemo(() => {
    const [sY, sM, sD] = rangeStart.split("-").map(Number);
    const [eY, eM, eD] = rangeEnd.split("-").map(Number);
    const start = new Date(sY, sM - 1, sD);
    const end = new Date(eY, eM - 1, eD);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }, [rangeStart, rangeEnd]);

  if (allEntries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No entries for this period.</p>
        <p className="text-xs text-muted-foreground mt-1">Start tracking to see your billing summary.</p>
      </div>
    );
  }

  // Max for the bar scaling — use billable value if any client has revenue,
  // otherwise fall back to total time so the bars still convey relative weight.
  const maxValue = Math.max(...clientSummaries.map((c) => c.billableValue), 0);
  const maxMins = Math.max(...clientSummaries.map((c) => c.totalMins), 0);
  const useValueScale = maxValue > 0;

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/60">
      {clientSummaries.map((c) => {
        const sym = CURRENCY_SYMBOLS[c.currency] ?? "€";
        const isExpanded = expandedId === c.id;
        const color = clientColorMap?.[c.id] ?? fallbackClientColor(c.id);
        const barPct = useValueScale
          ? (maxValue > 0 ? (c.billableValue / maxValue) * 100 : 0)
          : (maxMins > 0 ? (c.totalMins / maxMins) * 100 : 0);
        const unbillableMins = c.totalMins - c.billableMins;
        const isActive = activeClientFilter === c.id;

        return (
          <div key={c.id}>
            <button
              onClick={() => toggle(c.id)}
              className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors ${
                isActive ? "bg-primary/5" : "hover:bg-muted/30"
              }`}
            >
              {/* Avatar with initials */}
              <div
                className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: color }}
              >
                {initialsOf(c.name)}
              </div>

              {/* Body: name, sub, bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{c.name}</span>
                  <span className="text-sm font-bold font-mono text-foreground tabular-nums shrink-0">
                    {sym}{c.billableValue.toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {c.billableMins > 0 ? `${formatHM(c.billableMins)} billable` : "0h 00m billable"}
                  {unbillableMins > 0 ? ` · ${formatHM(unbillableMins)} unbillable` : ""}
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(barPct, 2)}%`, background: color }}
                  />
                </div>
              </div>

              <ChevronRight
                className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
            </button>

            {/* Expanded sessions + actions */}
            {isExpanded && (
              <div className="border-t border-border/60 bg-muted/10">
                <div className="flex items-center justify-end px-3 py-2 gap-3">
                  {c.outstanding > 0 && (
                    <span className="text-[11px] text-muted-foreground">{sym}{c.outstanding.toFixed(2)} outstanding</span>
                  )}
                  {isPro && c.billableValue > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onBillClient(c.id); }}
                      className="text-[11px] font-medium flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-foreground/10 text-foreground hover:bg-foreground/15 transition-colors"
                    >
                      Send <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className={activeClientFilter && daysInRange <= 7 ? "" : "max-h-60 overflow-y-auto"}>
                  {c.entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => onEditEntry?.(entry)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm border-t border-border/60 hover:bg-muted/40 transition-colors text-left"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-muted-foreground text-[11px]">
                          {new Date(entry.entry_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        <span className="text-foreground font-medium text-xs truncate">
                          {entry.project_name ?? "No project"}
                          {entry.task_name ? ` · ${entry.task_name}` : ""}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                        <span className="font-mono text-foreground text-xs">{formatHM(entryDisplayValues(entry, rounding).displayMinutes)}</span>
                        {entry.billable && entryDisplayValues(entry, rounding).displayValue > 0 ? (
                          <span className="font-mono text-muted-foreground text-[11px]">
                            {sym}{entryDisplayValues(entry, rounding).displayValue.toFixed(2)}
                            {entry.billing_status === "unbilled" && (
                              <span className="ml-1 text-foreground font-medium">unbilled</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
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

      {/* Unassigned row */}
      {unassignedSummary.entries.length > 0 && (
        <div>
          <button
            onClick={() => toggle("__unassigned__")}
            className="w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
          >
            <div
              className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: "hsl(240 5% 65%)" }}
            >
              NA
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground truncate">Unassigned</span>
                <span className="text-sm font-bold font-mono text-foreground tabular-nums shrink-0">
                  {formatHM(unassignedSummary.totalMins)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Not billable · tap to assign</div>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expandedId === "__unassigned__" ? "rotate-90" : ""}`}
            />
          </button>

          {expandedId === "__unassigned__" && (
            <div className="border-t border-border/60 bg-muted/10">
              <div className="flex justify-end px-3 py-2">
                <button
                  onClick={onOpenUnassigned}
                  className="text-[11px] font-medium flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-foreground/10 text-foreground hover:bg-foreground/15 transition-colors"
                >
                  Assign entries <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {unassignedSummary.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-3 py-2.5 text-xs border-t border-border/60 hover:bg-muted/40 transition-colors"
                  >
                    <button
                      onClick={() => onEditEntry?.(entry)}
                      className="flex flex-col gap-0.5 text-left flex-1 min-w-0"
                    >
                      <span className="text-muted-foreground text-[11px]">
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
