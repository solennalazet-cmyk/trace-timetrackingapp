import { useEffect, useState } from "react";
import { Timer, PenLine, Clock, Phone, CircleDot } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateKey } from "@/lib/utils";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import { formatDuration } from "@/hooks/useTimer";

interface TodayEntry {
  id: string;
  entry_type: string | null;
  duration_minutes: number;
  billable: boolean | null;
  rate_amount: number | null;
  rate_currency: string | null;
  rate_unit: string | null;
  start_time: string | null;
  end_time: string | null;
  client_name?: string;
  project_name?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const entryIcon = (type: string | null) => {
  switch (type) {
    case "manual": return <PenLine className="w-3.5 h-3.5 text-muted-foreground" />;
    case "shift": return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    case "call": return <Phone className="w-3.5 h-3.5 text-muted-foreground" />;
    default: return <Timer className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatTimeOfDay = (isoStr: string | null) => {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const DesktopRightPanel = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TodayEntry[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let isFirst = true;
    const load = async () => {
      if (isFirst) setLoading(true);
      const today = toLocalDateKey(new Date());
      if (user) {
        const { data } = await supabase
          .from("time_entries")
          .select("id, entry_type, duration_minutes, billable, rate_amount, rate_currency, rate_unit, start_time, end_time, client:clients(id, name), project:projects(id, name)")
          .eq("user_id", user.id)
          .eq("entry_date", today)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (!cancelled) {
          setEntries((data ?? []).map((e: any) => ({
            ...e,
            client_name: (e.client as any)?.name ?? undefined,
            project_name: (e.project as any)?.name ?? undefined,
          })));
        }
        const { count } = await supabase
          .from("time_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("client_id", null)
          .is("project_id", null)
          .is("deleted_at", null);
        if (!cancelled) setUnassignedCount(count ?? 0);
      } else {
        const all = getAnonymousEntries();
        if (!cancelled) {
          setEntries(all.filter((e: any) => e.entry_date === today).map((e: any, i: number) => ({ ...e, id: e.id ?? `anon-${i}` })));
          setUnassignedCount(all.filter((e: any) => !e.client_id && !e.project_id).length);
        }
      }
      if (!cancelled) { setLoading(false); isFirst = false; }
    };
    load();

    // Refresh when entries change elsewhere
    const refresh = () => load();
    window.addEventListener("trace-entries-changed", refresh);
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener("trace-entries-changed", refresh);
      clearInterval(interval);
    };
  }, [user]);

  const totalMins = entries.reduce((s, e) => s + e.duration_minutes, 0);
  const billableMins = entries.filter((e) => e.billable).reduce((s, e) => s + e.duration_minutes, 0);
  const billableAmount = entries
    .filter((e) => e.billable && e.rate_amount)
    .reduce((s, e) => {
      const hrs = e.duration_minutes / 60;
      const rate = e.rate_amount ?? 0;
      return s + (e.rate_unit === "hour" ? hrs * rate : rate);
    }, 0);
  const currency = entries.find((e) => e.rate_currency)?.rate_currency ?? "EUR";
  const sym = CURRENCY_SYMBOLS[currency] ?? "€";

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:py-6 lg:px-4 lg:border-l border-border/40 overflow-y-auto"
      style={{ backgroundColor: "hsl(var(--card) / 0.4)", backdropFilter: "blur(12px)" }}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Today</h2>
        <p className="text-[11px] text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tracked</p>
          <p className="text-sm font-bold font-mono text-foreground mt-0.5">{formatHHMM(totalMins)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Billable</p>
          <p className="text-sm font-bold font-mono text-foreground mt-0.5">{formatHHMM(billableMins)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Value</p>
          <p className="text-sm font-bold font-mono text-foreground mt-0.5">{sym}{billableAmount.toFixed(0)}</p>
        </div>
      </div>

      {unassignedCount > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/60 p-3 mb-4 flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1">{unassignedCount} unassigned</span>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Entries</p>
        <span className="text-[11px] text-muted-foreground">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} · {formatDuration(totalMins)}
        </span>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {loading && <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>}
        {!loading && entries.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">No entries today.</p>
            <p className="text-[11px] text-muted-foreground mt-1">Start a timer to begin.</p>
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="p-2.5 rounded-xl border border-border/60 bg-card/40 hover:bg-card/70 transition-colors"
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {entryIcon(entry.entry_type)}
                <span className="text-xs font-medium text-foreground truncate">
                  {entry.client_name || <span className="text-muted-foreground italic">Unassigned</span>}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className="font-mono text-xs font-semibold text-foreground">{formatHHMM(entry.duration_minutes)}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${entry.billable ? "bg-primary" : "bg-muted-foreground/30"}`} />
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-5">
              {entry.start_time && (
                <span>{formatTimeOfDay(entry.start_time)}{entry.end_time ? ` → ${formatTimeOfDay(entry.end_time)}` : ""}</span>
              )}
              {entry.start_time && entry.project_name && <span>·</span>}
              {entry.project_name && <span className="truncate">{entry.project_name}</span>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default DesktopRightPanel;
