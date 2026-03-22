import { useEffect, useState } from "react";
import { Timer, PenLine, Clock, Phone, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TrashedEntry {
  id: string;
  entry_type: string | null;
  duration_minutes: number;
  entry_date: string | null;
  deleted_at: string;
}

interface TrashViewProps {
  onBack: () => void;
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

const daysAgo = (isoStr: string) => {
  const deleted = new Date(isoStr);
  const now = new Date();
  return Math.floor((now.getTime() - deleted.getTime()) / 86400000);
};

const TrashView = ({ onBack, onCountChange }: TrashViewProps) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TrashedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("time_entries")
      .select("id, entry_type, duration_minutes, entry_date, deleted_at")
      .eq("user_id", user.id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    const items = (data ?? []) as TrashedEntry[];
    setEntries(items);
    onCountChange(items.length);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const restore = async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    onCountChange(Math.max(entries.length - 1, 0));
    await supabase.from("time_entries").update({ deleted_at: null }).eq("id", id);
    toast.success("Entry restored.");
  };

  const permanentDelete = async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    onCountChange(Math.max(entries.length - 1, 0));
    await supabase.from("time_entries").delete().eq("id", id);
    toast.success("Entry permanently deleted.");
    setConfirmDeleteId(null);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} className="text-sm text-primary hover:underline">← Back</button>
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-0.5">
        Trash ({entries.length} {entries.length === 1 ? "entry" : "entries"})
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Entries are permanently deleted after 7 days.
      </p>

      {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>}

      {!loading && entries.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Trash is empty.</p>
      )}

      <div className="space-y-2">
        {entries.map((entry) => {
          const ago = daysAgo(entry.deleted_at);
          const remaining = Math.max(7 - ago, 0);
          return (
            <div key={entry.id} className="p-3 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-1">
                {entryTypeIcon(entry.entry_type)}
                <span className="text-xs text-muted-foreground">
                  {formatEntryDate(entry.entry_date)}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {formatHHMM(entry.duration_minutes)}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {entry.entry_type ?? "Timer"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2 pl-6">
                Deleted {ago === 0 ? "today" : `${ago} ${ago === 1 ? "day" : "days"} ago`}
                {" · "}
                {remaining === 0 ? "Deleting soon" : `Gone in ${remaining} ${remaining === 1 ? "day" : "days"}`}
              </p>
              <div className="flex gap-2 pl-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-lg text-xs h-8"
                  onClick={() => restore(entry.id)}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 rounded-lg text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDeleteId(entry.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete now
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm permanent delete */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This entry will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteId && permanentDelete(confirmDeleteId)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrashView;
