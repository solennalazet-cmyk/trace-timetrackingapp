import { useEffect, useState } from "react";
import { startOfWeek } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateKey, getClientColor } from "@/lib/utils";
import { getAnonymousEntries } from "@/lib/anonymous-store";

interface Entry {
  duration_minutes: number;
  entry_date: string;
  billable: boolean | null;
  rate_amount: number | null;
  rate_unit: string | null;
  rate_currency: string | null;
  client_id: string | null;
  client_name?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

const ReportsRightPanel = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [weekStart, setWeekStart] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let isFirst = true;
    const load = async () => {
      let ws: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1;
      if (user) {
        const { data } = await supabase.from("user_settings").select("week_start_day").eq("user_id", user.id).single();
        ws = ((data as any)?.week_start_day ?? 1) as any;
      } else {
        try {
          const raw = localStorage.getItem("trace_user_settings");
          if (raw) ws = (JSON.parse(raw).week_start_day ?? 1) as any;
        } catch {}
      }
      if (!cancelled) setWeekStart(ws);

      const from = startOfWeek(new Date(), { weekStartsOn: ws });
      const to = new Date(from); to.setDate(to.getDate() + 6);
      const fromKey = toLocalDateKey(from);
      const toKey = toLocalDateKey(to);

      if (user) {
        const { data } = await supabase
          .from("time_entries")
          .select("duration_minutes, entry_date, billable, rate_amount, rate_unit, rate_currency, client_id, client:clients(name)")
          .eq("user_id", user.id)
          .gte("entry_date", fromKey).lte("entry_date", toKey)
          .is("deleted_at", null);
        if (!cancelled) {
          setEntries((data ?? []).map((e: any) => ({ ...e, client_name: (e.client as any)?.name })));
        }
      } else {
        const all = getAnonymousEntries();
        if (!cancelled) {
          setEntries(all.filter((e: any) => e.entry_date >= fromKey && e.entry_date <= toKey));
        }
      }
      if (!cancelled) { setLoaded(true); isFirst = false; }
    };
    load();
    const refresh = () => load();
    window.addEventListener("trace-entries-changed", refresh);
    window.addEventListener("trace-settings-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("trace-entries-changed", refresh);
      window.removeEventListener("trace-settings-changed", refresh);
    };
  }, [user]);

  // Daily overview
  const weekFrom = startOfWeek(new Date(), { weekStartsOn: weekStart });
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekFrom); d.setDate(d.getDate() + i);
    return d;
  });
  const dailyData = days.map((d) => {
    const key = toLocalDateKey(d);
    const mins = entries.filter((e) => e.entry_date === key).reduce((s, e) => s + e.duration_minutes, 0);
    return {
      key,
      label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      dateLabel: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      hours: +(mins / 60).toFixed(2),
    };
  });

  // Totals
  const totalMins = entries.reduce((s, e) => s + e.duration_minutes, 0);
  const billableMins = entries.filter((e) => e.billable).reduce((s, e) => s + e.duration_minutes, 0);
  const billableValue = entries.filter((e) => e.billable && e.rate_amount).reduce((s, e) => {
    const hrs = e.duration_minutes / 60;
    const rate = e.rate_amount ?? 0;
    return s + (e.rate_unit === "hour" ? hrs * rate : rate);
  }, 0);
  const currency = entries.find((e) => e.rate_currency)?.rate_currency ?? "EUR";
  const sym = CURRENCY_SYMBOLS[currency] ?? "€";

  // Top clients
  const clientTotals: Record<string, { name: string; mins: number; id: string }> = {};
  entries.forEach((e) => {
    const id = e.client_id ?? "unassigned";
    if (!clientTotals[id]) {
      clientTotals[id] = { name: e.client_name ?? (e.client_id ? "Unknown" : "Unassigned"), mins: 0, id };
    }
    clientTotals[id].mins += e.duration_minutes;
  });
  const topClients = Object.values(clientTotals).sort((a, b) => b.mins - a.mins).slice(0, 5);
  const maxMins = topClients[0]?.mins ?? 1;

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:py-6 lg:px-4 lg:border-l border-border/40 overflow-y-auto"
      style={{ backgroundColor: "hsl(var(--card) / 0.4)", backdropFilter: "blur(12px)" }}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">This week</h2>
        <p className="text-[11px] text-muted-foreground">
          {weekFrom.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total time</p>
          <p className="text-sm font-bold font-mono text-foreground mt-0.5">{formatHHMM(totalMins)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Turnover</p>
          <p className="text-sm font-bold font-mono text-foreground mt-0.5">{sym}{billableValue.toFixed(0)}</p>
        </div>
      </div>

      {/* Daily overview */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-3 mb-4">
        <p className="text-xs font-semibold text-foreground mb-2">Daily overview</p>
        <div style={{ width: "100%", height: 140 }}>
          <ResponsiveContainer>
            <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [`${v}h`, "Hours"]}
              />
              <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top clients */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-3">
        <p className="text-xs font-semibold text-foreground mb-2">Top clients</p>
        {topClients.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-2">No entries this week.</p>
        )}
        <div className="space-y-2">
          {topClients.map((c) => {
            const pct = (c.mins / maxMins) * 100;
            const color = c.id === "unassigned" ? "hsl(240 5% 75%)" : getClientColor(c.id);
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-foreground truncate">{c.name}</span>
                  </div>
                  <span className="font-mono text-muted-foreground shrink-0 ml-2">{formatHHMM(c.mins)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default ReportsRightPanel;
