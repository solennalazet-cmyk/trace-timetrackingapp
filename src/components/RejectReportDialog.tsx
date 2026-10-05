import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { interpretReviewResult, REJECTABLE_STATUSES } from "@/lib/review-guard";
import { runExclusive } from "@/lib/action-lock";

export const REJECT_REASONS = [
  { value: "missing_session", label: "Missing session" },
  { value: "incorrect_hours", label: "Incorrect hours" },
  { value: "incorrect_information", label: "Incorrect information" },
  { value: "other", label: "Other" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportId: string | null;
  onRejected?: () => void;
  /** Status the employer sees; "approved" means reversing an approval. */
  fromStatus?: string;
  currency?: string;
}

const RejectReportDialog = ({ open, onOpenChange, reportId, onRejected, fromStatus, currency }: Props) => {
  const { user } = useAuth();
  const [myPaid, setMyPaid] = useState(0);
  useEffect(() => {
    setMyPaid(0);
    if (!open || !reportId || !user || fromStatus !== "approved") return;
    let cancelled = false;
    supabase.from("report_payments").select("amount").eq("submitted_report_id", reportId).eq("recorded_by_user_id", user.id)
      .then(({ data }) => { if (!cancelled) setMyPaid((data ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)); });
    return () => { cancelled = true; };
  }, [open, reportId, user, fromStatus]);
  const sym = ({ EUR: "€", USD: "$", GBP: "£" } as Record<string, string>)[currency ?? "EUR"] ?? "€";
  const [reason, setReason] = useState<string>("missing_session");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [working, setWorking] = useState(false);

  const handleReject = async () => {
    if (!reportId) return;
    if (reason === "other" && note.trim().length === 0) {
      toast.error("Please add a note explaining the rejection.");
      return;
    }
    setWorking(true);
    const { data, error } = await runExclusive(`review:${reportId}`, async () =>
      await supabase
        .from("submitted_reports")
        .update({
          status: "rejected",
          rejection_reason: reason,
          rejection_note: note.trim() || null,
          notify_worker: notify,
        } as any)
        .eq("id", reportId)
        .in("status", [...REJECTABLE_STATUSES])
        .select("id"),
    );
    setWorking(false);
    const outcome = interpretReviewResult(data as { id: string }[] | null, error);
    if (!outcome.ok) {
      if (outcome.kind === "stale") {
        toast.info(outcome.message);
        onOpenChange(false);
        onRejected?.();
      } else {
        toast.error(outcome.message);
      }
      return;
    }
    toast.success(notify ? "Report rejected. The freelancer has been notified." : "Report rejected quietly. The freelancer wasn't notified.");
    setNote("");
    setReason("missing_session");
    setNotify(true);
    onOpenChange(false);
    onRejected?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl w-[calc(100vw-2rem)] max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Reject report</AlertDialogTitle>
          <AlertDialogDescription>
            {notify
              ? "The freelancer will be notified with your reason and can edit and resubmit."
              : "The freelancer won't be notified. The report is marked rejected on your side only."}
          </AlertDialogDescription>
          {myPaid > 0 && (
            <p className="text-xs text-muted-foreground rounded-xl bg-muted/50 p-3 mt-2">
              You recorded {sym}{myPaid.toFixed(2)} on this report. It stays on record and still counts as money paid. The report itself no longer counts as due while it is rejected.
            </p>
          )}
        </AlertDialogHeader>
        <div className="space-y-3">
          <RadioGroup value={reason} onValueChange={setReason}>
            {REJECT_REASONS.map((r) => (
              <div key={r.value} className="flex items-center gap-2">
                <RadioGroupItem value={r.value} id={`rr-${r.value}`} />
                <Label htmlFor={`rr-${r.value}`} className="text-sm font-normal">{r.label}</Label>
              </div>
            ))}
          </RadioGroup>
          <Textarea
            placeholder={reason === "other" ? "Required — describe the issue" : "Optional note for the freelancer"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <Label htmlFor="rr-notify" className="text-sm font-medium">Notify the freelancer</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Turn off to reject quietly — no alert is sent.
              </p>
            </div>
            <Switch id="rr-notify" checked={notify} onCheckedChange={setNotify} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleReject} disabled={working}>
            {working ? "Rejecting…" : "Reject report"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RejectReportDialog;
