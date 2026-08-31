import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const todayKey = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const fmt = (s: string | null) => {
  if (!s) return null;
  try {
    return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return s; }
};

export const isWorkerActive = (endDate: string | null) => !endDate || endDate >= todayKey();

interface Props {
  clientId: string;
  startDate: string | null;
  endDate: string | null;
  onSaved: () => void;
}

/**
 * Compact engagement status control. Deliberately NOT a Card: it is a state
 * indicator for the person, not a section of their profile, so it lives in the
 * header next to the name rather than in the list of editable cards.
 */
const WorkerStatusCard = ({ clientId, startDate, endDate, onSaved }: Props) => {
  const active = isWorkerActive(endDate);
  const [pending, setPending] = useState<"active" | "inactive" | null>(null);
  const [date, setDate] = useState(todayKey());
  const [saving, setSaving] = useState(false);

  const openFor = (next: "active" | "inactive") => {
    setDate(next === "inactive" ? todayKey() : (startDate || todayKey()));
    setPending(next);
  };

  const confirm = async () => {
    if (!date) { toast.error("Pick a date first."); return; }
    setSaving(true);
    const patch = pending === "inactive"
      ? { engagement_end_date: date }
      : { engagement_start_date: date, engagement_end_date: null };
    const { error } = await supabase.from("clients").update(patch as any).eq("id", clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(pending === "inactive" ? "Marked as inactive." : "Marked as active.");
    setPending(null);
    onSaved();
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div
          className={`inline-flex items-center gap-2 rounded-full pl-2.5 pr-1.5 py-1 ${
            active ? "bg-foreground/10" : "bg-muted"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${active ? "bg-nav-bg" : "bg-muted-foreground/60"}`}
            aria-hidden
          />
          <span className="text-[11px] font-medium">{active ? "Active" : "Inactive"}</span>
          <Switch
            checked={active}
            onCheckedChange={(v) => openFor(v ? "active" : "inactive")}
            aria-label="Toggle freelancer active status"
            className="scale-75 origin-right"
          />
        </div>
        <p className="text-[10px] text-muted-foreground text-right leading-tight">
          {active
            ? (fmt(startDate) ? `Since ${fmt(startDate)}` : "Currently works for you")
            : `Ended ${fmt(endDate)}`}
        </p>
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent position="centered" className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl p-6">
          <DialogHeader className="pr-10">
            <DialogTitle>{pending === "inactive" ? "Mark as inactive" : "Mark as active"}</DialogTitle>
            <DialogDescription>
              {pending === "inactive"
                ? "Pick the last day this freelancer worked for you."
                : "Pick the date this freelancer starts (or resumes) working for you."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {pending === "inactive" ? "End date" : "Start date"}
            </label>
            <Input type="date" className="h-11 rounded-xl" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setPending(null)}>Cancel</Button>
            <Button className="rounded-xl" onClick={confirm} disabled={saving}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkerStatusCard;
