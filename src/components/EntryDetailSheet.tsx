import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Timer, PenLine, Clock, Phone, Pencil, Trash2 } from "lucide-react";
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

export interface TimeEntry {
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
  billable_value: number | null;
  billing_status: string | null;
  client_id: string | null;
  project_id: string | null;
  task_id: string | null;
  start_time: string | null;
  end_time: string | null;
  client_name?: string;
  project_name?: string;
  task_name?: string;
}

interface EntryDetailSheetProps {
  entry: TimeEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (entry: TimeEntry) => void;
  onDeleted: (id: string) => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const entryTypeLabel = (type: string | null) => {
  switch (type) {
    case "manual": return "Manual Entry";
    case "shift": return "Shift";
    case "call": return "Call";
    default: return "Timer";
  }
};

const entryTypeIcon = (type: string | null) => {
  switch (type) {
    case "manual": return <PenLine className="w-4 h-4" />;
    case "shift": return <Clock className="w-4 h-4" />;
    case "call": return <Phone className="w-4 h-4" />;
    default: return <Timer className="w-4 h-4" />;
  }
};

const formatHHMM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatFullDate = (dateStr: string | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
};

const EntryDetailSheet = ({ entry, open, onOpenChange, onEdit, onDeleted }: EntryDetailSheetProps) => {
  const { user } = useAuth();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (!entry) return null;

  const sym = CURRENCY_SYMBOLS[entry.rate_currency ?? "EUR"] ?? "€";
  const isUnassigned = !entry.client_id && !entry.project_id;

  const handleDelete = async () => {
    if (user) {
      await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entry.id);
    }
    onDeleted(entry.id);
    onOpenChange(false);
    setDeleteConfirm(false);
    toast.success("Entry deleted.");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {entryTypeIcon(entry.entry_type)}
              {entryTypeLabel(entry.entry_type)}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="text-sm text-muted-foreground">{formatFullDate(entry.entry_date)}</p>
              <p className="font-mono text-2xl font-bold">{formatHHMM(entry.duration_minutes)}</p>
              {(entry.break_minutes ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">{entry.break_minutes}m break</p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium">{entry.client_name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Project</span>
                <span className="font-medium">{entry.project_name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Task</span>
                <span className="font-medium">{entry.task_name || "—"}</span>
              </div>
              {entry.notes && (
                <div>
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-1 text-foreground">{entry.notes}</p>
                </div>
              )}
              {entry.tags && entry.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">{tag}</span>
                  ))}
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Billable</span>
                <span className={`w-2.5 h-2.5 rounded-full ${entry.billable ? "bg-primary" : "bg-muted-foreground/30"}`} />
              </div>
              {entry.billable && entry.rate_amount != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-medium">{sym}{entry.rate_amount} / {entry.rate_unit ?? "hour"}</span>
                </div>
              )}
              {entry.billable_value != null && entry.billable_value > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Value</span>
                  <span className="font-medium">{sym}{entry.billable_value.toFixed(2)}</span>
                </div>
              )}
            </div>

            {isUnassigned && (
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold"
                onClick={() => { onOpenChange(false); onEdit(entry); }}
              >
                Assign this entry →
              </Button>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-[28px] h-10 gap-1"
                onClick={() => { onOpenChange(false); onEdit(entry); }}
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
              <button
                className="text-sm text-destructive hover:underline"
                onClick={() => setDeleteConfirm(true)}
              >
                Delete
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default EntryDetailSheet;
