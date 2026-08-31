import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserCheck } from "lucide-react";
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
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{active ? "Active" : "Inactive"}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {active
                ? (fmt(startDate) ? `Working with you since ${fmt(startDate)}` : "Currently works for you")
                : `Ended ${fmt(endDate)}`}
            </p>
          </div>
          <Switch
            checked={active}
            onCheckedChange={(v) => openFor(v ? "active" : "inactive")}
            aria-label="Toggle freelancer active status"
          />
        </div>
      </Card>

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <DialogHeader>
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
