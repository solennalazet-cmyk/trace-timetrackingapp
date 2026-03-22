import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type TimeEntry } from "@/components/EntryDetailSheet";

type BillingRange = "week" | "month" | "last-month" | "custom";

const BILLING_RANGES: { key: BillingRange; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
];

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

const getBillingRangeStart = (range: BillingRange): string => {
  const now = new Date();
  let d: Date;
  switch (range) {
    case "week": {
      d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      d.setDate(d.getDate() - diff);
      break;
    }
    case "month":
      d = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last-month":
      d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      break;
    default:
      d = new Date(now.getTime() - 6 * 86400000);
  }
  return d.toISOString().split("T")[0];
};

const getBillingRangeEnd = (range: BillingRange): string => {
  const now = new Date();
  if (range === "last-month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
    return d.toISOString().split("T")[0];
  }
  return now.toISOString().split("T")[0];
};

const getDaysInBillingRange = (startStr: string, endStr: string): string[] => {
  const days: string[] = [];
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  let d = new Date(start);
  while (d <= end) {
    days.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
};

interface ClientBillingSummaryProps {
  allEntries: TimeEntry[];
  clients: Record<string, string>;
  projects: Record<string, string>;
  isPro: boolean;
  onBillClient: (clientId: string) => void;
  onOpenUnassigned: () => void;
}

interface ClientSummary {
  id: string;
  name: string;
  totalMins: number;
  billableMins: number;
  billableValue: number;
  outstanding: number;
  currency: string;
  projectBreakdown: { id: string; name: string; mins: number; value: number; unbilled: boolean }[];
}

const ClientBillingSummary = ({
  allEntries,
  clients,
  projects,
  isPro,
  onBillClient,
  onOpenUnassigned,
}: ClientBillingSummaryProps) => {
  const [billingRange, setBillingRange] = useState<BillingRange>("week");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const rangeStart = getBillingRangeStart(billingRange);
  const rangeEnd = getBillingRangeEnd(billingRange);

  // Filter entries to billing range
  const filteredEntries = useMemo(() =>
    allEntries.filter((e) => {
      const d = e.entry_date ?? "";
      return d >= rangeStart && d <= rangeEnd;
    }),
    [allEntries, rangeStart, rangeEnd]
  );

  // Build client summaries
  const { clientSummaries, unassignedSummary } = useMemo(() => {
    const clientMap: Record<string, ClientSummary> = {};
    let unassignedMins = 0;

    filteredEntries.forEach((e) => {
      if (!e.client_id) {
        unassignedMins += e.duration_minutes;
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
          projectBreakdown: [],
        };
      }
      const c = clientMap[e.client_id];
      c.totalMins += e.duration_minutes;
      if (e.billable) {
        c.billableMins += e.duration_minutes;
        c.billableValue += e.billable_value || 0;
        if (e.billing_status === "unbilled") {
          c.outstanding += e.billable_value || 0;
        }
      }
    });

    // Build project breakdowns
    Object.values(clientMap).forEach((c) => {
      const projMap: Record<string, { mins: number; value: number; hasUnbilled: boolean }> = {};
      filteredEntries
        .filter((e) => e.client_id === c.id)
        .forEach((e) => {
          const pid = e.project_id ?? "unassigned";
          if (!projMap[pid]) projMap[pid] = { mins: 0, value: 0, hasUnbilled: false };
          projMap[pid].mins += e.duration_minutes;
          projMap[pid].value += e.billable_value || 0;
          if (e.billing_status === "unbilled" && e.billable) projMap[pid].hasUnbilled = true;
        });

      c.projectBreakdown = Object.entries(projMap)
        .map(([id, d]) => ({
          id,
          name: id === "unassigned" ? "Unassigned" : (projects[id] ?? "Unknown"),
          mins: d.mins,
          value: d.value,
          unbilled: d.hasUnbilled,
        }))
        .sort((a, b) => b.mins - a.mins);
    });

    return {
      clientSummaries: Object.values(clientMap).sort((a, b) => b.totalMins - a.totalMins),
      unassignedSummary: { totalMins: unassignedMins },
    };
  }, [filteredEntries, clients, projects]);

  // Daily breakdown
  const dailyBreakdown = useMemo(() => {
    const days = getDaysInBillingRange(rangeStart, rangeEnd);
    const dayMap: Record<string, { mins: number; value: number }> = {};
    filteredEntries.forEach((e) => {
      const d = e.entry_date ?? "";
      if (!dayMap[d]) dayMap[d] = { mins: 0, value: 0 };
      dayMap[d].mins += e.duration_minutes;
      dayMap[d].value += e.billable_value || 0;
    });
    const totalMins = filteredEntries.reduce((s, e) => s + e.duration_minutes, 0);
    const totalValue = filteredEntries.reduce((s, e) => s + (e.billable_value || 0), 0);

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
  }, [filteredEntries, rangeStart, rangeEnd]);

  const toggleExpand = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const rangeLabel = BILLING_RANGES.find((r) => r.key === billingRange)?.label ?? "This week";

  if (filteredEntries.length === 0) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Client Summary</h3>
          <Select value={billingRange} onValueChange={(v) => setBillingRange(v as BillingRange)}>
            <SelectTrigger className="h-7 w-auto text-xs gap-1 border-border rounded-full px-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Client Summary</h3>
        <Select value={billingRange} onValueChange={(v) => setBillingRange(v as BillingRange)}>
          <SelectTrigger className="h-7 w-auto text-xs gap-1 border-border rounded-full px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CLIENT_COLORS[i % CLIENT_COLORS.length] }} />
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
                      className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
                    >
                      Bill client <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded: project breakdown */}
              {isExpanded && (
                <div className="border-t border-border px-3 py-2 bg-muted/20">
                  {c.projectBreakdown.map((p, pi) => (
                    <div key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{pi === c.projectBreakdown.length - 1 ? "└──" : "├──"}</span>
                        <span className="text-foreground font-medium">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{formatHM(p.mins)}</span>
                        {p.value > 0 ? (
                          <span>
                            {sym}{p.value.toFixed(2)}
                            {p.unbilled && <span className="text-primary ml-1">unbilled</span>}
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned row */}
        {unassignedSummary.totalMins > 0 && (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "hsl(240 5% 75%)" }} />
                <span className="text-sm font-medium text-foreground">Unassigned</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatHM(unassignedSummary.totalMins)} total · not billable
            </p>
            <div className="flex justify-end mt-1.5">
              <button
                onClick={onOpenUnassigned}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
              >
                Assign entries <ArrowRight className="w-3 h-3" />
              </button>
            </div>
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
