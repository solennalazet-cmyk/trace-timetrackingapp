import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Timer, PenLine, Clock, Phone, Trash2, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousEntries } from "@/lib/anonymous-store";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const formatEntryDate = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

const UnassignedPanel = ({ open, onOpenChange, onAssignEntry, onCountChange }: UnassignedPanelProps) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<UnassignedEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<UnassignedEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    if (user) {
      const { data } = await supabase
        .from("time_entries")
        .select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, client_id, project_id, task_id")
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

  const handleDelete = async (id: string) => {
    if (user) {
      await supabase.from("time_entries").delete().eq("id", id);
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    onCountChange(entries.length - 1);
    setSelectedEntry(null);
    setDeleteConfirm(null);
    toast.success("Entry deleted.");

    if (entries.length <= 1) {
      onOpenChange(false);
    }
  };

  const handleAssign = (entry: UnassignedEntry) => {
    onAssignEntry(entry);
    // Remove from list optimistically
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    onCountChange(entries.length - 1);
    setSelectedEntry(null);
    if (entries.length <= 1) onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Unassigned Work ({entries.length})</SheetTitle>
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
                onClick={() => setDeleteConfirm(selectedEntry.id)}
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
                <button
                  key={entry.id}
                  className="flex items-center justify-between w-full text-left px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedEntry(entry)}
                >
                  <div className="flex items-center gap-3">
                    {entryTypeIcon(entry.entry_type)}
                    <div>
                      <p className="font-mono text-sm font-semibold">{formatHHMM(entry.duration_minutes)}</p>
                      <p className="text-xs text-muted-foreground">{formatEntryDate(entry.entry_date)}</p>
                    </div>
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground truncate max-w-[120px]">{entry.notes}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UnassignedPanel;
