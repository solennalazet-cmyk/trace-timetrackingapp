import { useEffect, useState, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Timer, PenLine, Clock, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousEntries } from "@/lib/anonymous-store";

interface TodayEntry {
  id: string;
  entry_type: string | null;
  duration_minutes: number;
  break_minutes: number | null;
  entry_date: string | null;
  notes: string | null;
  tags: string[] | null;
  billable: boolean | null;
  rate_amount: number | null;
  rate_currency: string | null;
  rate_unit: string | null;
  client_id: string | null;
  project_id: string | null;
  task_id: string | null;
  start_time: string | null;
  end_time: string | null;
  client_name?: string;
  project_name?: string;
}

interface TodayEntriesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntryTap: (entry: TodayEntry) => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const entryTypeIcon = (type: string | null) => {
  switch (type) {
    case "manual": return <PenLine className="w-4 h-4 text-muted-foreground" />;
    case "shift": return <Clock className="w-4 h-4 text-muted-foreground" />;
    case "call": return <Phone className="w-4 h-4 text-muted-foreground" />;
    default: return <Timer className="w-4 h-4 text-muted-foreground" />;
  }
};

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const SwipeableRow = ({
  children,
  onSwipeLeft,
}: {
  children: React.ReactNode;
  onSwipeLeft: () => void;
}) => {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const swiping = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    swiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = startX.current - e.touches[0].clientX;
    const dy = Math.abs(e.touches[0].clientY - startY.current);
    // Only allow horizontal swipe if more horizontal than vertical
    if (dx > 10 && dx > dy * 2) swiping.current = true;
    if (swiping.current && rowRef.current) {
      const diff = e.touches[0].clientX - startX.current;
      if (diff < 0) {
        currentX.current = diff;
        rowRef.current.style.transform = `translateX(${Math.max(diff, -100)}px)`;
        rowRef.current.style.opacity = `${Math.max(1 + diff / 200, 0.3)}`;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = startX.current - e.changedTouches[0].clientX;
    const deltaY = Math.abs(startY.current - e.changedTouches[0].clientY);

    if (deltaX > 60 && deltaX > deltaY * 2) {
      if (rowRef.current) {
        rowRef.current.style.transition = "transform 0.2s, opacity 0.2s";
        rowRef.current.style.transform = "translateX(-100%)";
        rowRef.current.style.opacity = "0";
      }
      setTimeout(onSwipeLeft, 200);
    } else if (rowRef.current) {
      rowRef.current.style.transition = "transform 0.2s, opacity 0.2s";
      rowRef.current.style.transform = "translateX(0)";
      rowRef.current.style.opacity = "1";
    }
    setTimeout(() => {
      if (rowRef.current) rowRef.current.style.transition = "";
    }, 200);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex items-center justify-end pr-4 bg-muted/50 rounded-xl">
        <span className="text-xs text-muted-foreground font-medium">Hide</span>
      </div>
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative bg-card"
      >
        {children}
      </div>
    </div>
  );
};

const TodayEntriesSheet = ({ open, onOpenChange, onEntryTap }: TodayEntriesSheetProps) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TodayEntry[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHiddenIds(new Set());
    const load = async () => {
      setLoading(true);
      const today = toLocalDateKey(new Date());
      if (user) {
        const { data } = await supabase
          .from("time_entries")
          .select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, client_id, project_id, task_id, start_time, end_time, client:clients(id, name), project:projects(id, name)")
          .eq("user_id", user.id)
          .eq("entry_date", today)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (data && data.length > 0) {
          setEntries(data.map((e: any) => ({
            ...e,
            client_name: (e.client as any)?.name ?? undefined,
            project_name: (e.project as any)?.name ?? undefined,
          })));
        } else {
          setEntries([]);
        }
      } else {
        const all = getAnonymousEntries();
        setEntries(all.filter((e: any) => e.entry_date === today).map((e: any, i: number) => ({ ...e, id: e.id ?? `anon-${i}` })));
      }
      setLoading(false);
    };
    load();
  }, [open, user]);

  const visibleEntries = entries.filter((e) => !hiddenIds.has(e.id));
  const totalMins = visibleEntries.reduce((s, e) => s + e.duration_minutes, 0);

  const hideEntry = (id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Today's Entries</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {visibleEntries.length} {visibleEntries.length === 1 ? "entry" : "entries"} · {formatHHMM(totalMins)}
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-1.5">
          {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>}
          {!loading && visibleEntries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No entries today.</p>
          )}
          {visibleEntries.map((entry) => {
            const sym = CURRENCY_SYMBOLS[entry.rate_currency ?? "EUR"] ?? "€";
            return (
              <SwipeableRow key={entry.id} onSwipeLeft={() => hideEntry(entry.id)}>
                <button
                  className="w-full text-left p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors"
                  onClick={() => onEntryTap(entry)}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {entryTypeIcon(entry.entry_type)}
                      <span className="text-sm font-medium text-foreground truncate">
                        {entry.client_name || <span className="text-muted-foreground italic">Unassigned</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{formatHHMM(entry.duration_minutes)}</span>
                      <span className={`w-2 h-2 rounded-full ${entry.billable ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
                    {entry.project_name && <span>{entry.project_name}</span>}
                    {entry.project_name && entry.billable && entry.rate_amount && <span>·</span>}
                    {entry.billable && entry.rate_amount && (
                      <span>{sym}{entry.rate_amount}/{entry.rate_unit ?? "hr"}</span>
                    )}
                  </div>
                </button>
              </SwipeableRow>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TodayEntriesSheet;
