import { useEffect, useState, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Timer, PenLine, Clock, Phone, X, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import { toast } from "sonner";


interface UnassignedEntry {
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
}

interface UnassignedPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssignEntry: (entry: UnassignedEntry) => void;
  onCountChange: (count: number) => void;
}

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

const formatTimeOfDay = (isoStr: string | null) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const formatEntryDate = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

/* ── Swipeable row with "Delete" reveal ── */
const SwipeDeleteRow = ({
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
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-0 flex items-center justify-end pr-4 bg-destructive/10 rounded-lg">
        <span className="text-xs text-destructive font-medium">Delete</span>
      </div>
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative bg-background"
      >
        {children}
      </div>
    </div>
  );
};

const UnassignedPanel = ({ open, onOpenChange, onAssignEntry, onCountChange }: UnassignedPanelProps) => {
  const { user } = useAuth();
  
  const [entries, setEntries] = useState<UnassignedEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<UnassignedEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    if (user) {
      const { data } = await supabase
        .from("time_entries")
        .select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, client_id, project_id, task_id, start_time, end_time")
        .eq("user_id", user.id)
        .is("client_id", null)
        .is("project_id", null)
        .is("deleted_at", null)
        .order("entry_date", { ascending: false });
      setEntries((data ?? []) as UnassignedEntry[]);
      onCountChange((data ?? []).length);
    } else {
      const all = getAnonymousEntries();
      const unassigned = all.filter((e: any) => !e.client_id && !e.project_id)
        .map((e: any, i: number) => ({ ...e, id: e.id ?? `anon-${i}` }));
      setEntries(unassigned);
      onCountChange(unassigned.length);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      loadEntries();
      setSelectedEntry(null);
    }
  }, [open, user]);

  const softDelete = async (id: string) => {
    // Remove from list immediately
    setEntries((prev) => prev.filter((e) => e.id !== id));
    onCountChange(Math.max(entries.length - 1, 0));

    // Perform soft delete
    if (user) {
      await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    }

    // Undo toast
    toast("Entry deleted.", {
      action: {
        label: "Undo",
        onClick: async () => {
          if (user) {
            await supabase.from("time_entries").update({ deleted_at: null }).eq("id", id);
          }
          loadEntries();
        },
      },
      duration: 3750,
    });

    if (entries.length <= 1) onOpenChange(false);
  };

  const handleAssign = (entry: UnassignedEntry) => {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    onCountChange(Math.max(entries.length - 1, 0));
    setSelectedEntry(null);
    onOpenChange(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.setTimeout(() => onAssignEntry(entry), 240);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Unassigned Work ({entries.length})</SheetTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </SheetHeader>

        {selectedEntry ? (
          /* Detail view */
          <div className="mt-4 space-y-4">
            <div className="space-y-2 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                {entryTypeIcon(selectedEntry.entry_type)}
                <span className="text-sm font-medium capitalize">{selectedEntry.entry_type ?? "Timer"}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatEntryDate(selectedEntry.entry_date)}
              </p>
              {(selectedEntry.start_time || selectedEntry.end_time) && (
                <p className="text-sm text-muted-foreground">
                  {formatTimeOfDay(selectedEntry.start_time)}{selectedEntry.start_time && selectedEntry.end_time ? " → " : ""}{formatTimeOfDay(selectedEntry.end_time)}
                </p>
              )}
              <p className="font-mono text-2xl font-bold">
                {formatHHMM(selectedEntry.duration_minutes)}
              </p>
              {(selectedEntry.break_minutes ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">{selectedEntry.break_minutes}m break</p>
              )}
              {selectedEntry.notes && (
                <p className="text-sm text-muted-foreground mt-2">{selectedEntry.notes}</p>
              )}
            </div>

            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold"
              onClick={() => handleAssign(selectedEntry)}
            >
              Assign this entry
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <button
              className="w-full text-center text-sm text-destructive hover:underline"
              onClick={() => { setSelectedEntry(null); softDelete(selectedEntry.id); }}
            >
              Delete
            </button>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setSelectedEntry(null)}
            >
              ← Back to list
            </Button>
          </div>
        ) : (
          /* List view */
          <div className="mt-4 space-y-1">
            {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>}
            {!loading && entries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No unassigned entries.</p>
            )}
            {entries.map((entry) => (
              <SwipeDeleteRow key={entry.id} onSwipeLeft={() => softDelete(entry.id)}>
                <div className="flex items-center w-full px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    {entryTypeIcon(entry.entry_type)}
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{formatHHMM(entry.duration_minutes)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatEntryDate(entry.entry_date)}
                        {entry.start_time && ` · ${formatTimeOfDay(entry.start_time)}`}
                        {entry.end_time && ` → ${formatTimeOfDay(entry.end_time)}`}
                      </p>
                    </div>
                  </button>
                  <button
                    className="ml-2 shrink-0 text-xs text-destructive hover:underline px-2 py-1"
                    onClick={(e) => { e.stopPropagation(); softDelete(entry.id); }}
                  >
                    Delete
                  </button>
                </div>
              </SwipeDeleteRow>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default UnassignedPanel;
