import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EXPORT_COLUMN_OPTIONS, type ExportColumnKey } from "@/lib/export-columns";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const REJECT_REASONS = [
  { value: "missing_session", label: "Missing session" },
  { value: "incorrect_hours", label: "Incorrect hours" },
  { value: "incorrect_information", label: "Incorrect information" },
  { value: "other", label: "Other" },
] as const;

export interface SubmittedReport {
  id: string;
  worker_user_id: string;
  employer_user_id: string | null;
  client_id: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  total_amount: number;
  currency: string;
  shared_columns: string[];
  entries_snapshot: any;
  status: string;
  submitted_at: string;
  rejection_reason: string | null;
  rejection_note: string | null;
  // Resolved on read
  client_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  report: SubmittedReport | null;
  onReviewed?: () => void;
  /** When true, hide approve/reject actions (worker viewing their own submission). */
  readOnly?: boolean;
}

const formatHM = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
const formatDur = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const formatClock = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
};
const formatDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const SubmittedReportSheet = ({ open, onOpenChange, report, onReviewed, readOnly }: Props) => {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState<string>("missing_session");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  const sym = report ? (CURRENCY_SYMBOLS[report.currency] ?? "€") : "€";
  const entries = useMemo(() => {
    const arr = Array.isArray(report?.entries_snapshot) ? [...report!.entries_snapshot] : [];
    arr.sort((a: any, b: any) => {
      const da = (a.entry_date ?? "") + (a.start_time ?? "");
      const db = (b.entry_date ?? "") + (b.start_time ?? "");
      return da.localeCompare(db);
    });
    return arr;
  }, [report]);
  const sharedCols = (report?.shared_columns ?? []) as ExportColumnKey[];
  const orderedCols = EXPORT_COLUMN_OPTIONS.filter((o) => sharedCols.includes(o.key)).map((o) => o.key);

  const pauseInfo = useMemo(() => {
    return entries.map((e: any, i: number) => {
      if (i === 0) return null;
      const prev = entries[i - 1];
      if (!prev.entry_date || !e.entry_date || prev.entry_date !== e.entry_date) return null;
      if (!prev.end_time || !e.start_time) return null;
      const gap = Math.round((new Date(e.start_time).getTime() - new Date(prev.end_time).getTime()) / 60000);
      if (gap <= 0) return null;
      return { prevEnd: prev.end_time as string, thisStart: e.start_time as string, gapMinutes: gap };
    });
  }, [entries]);

  const cellFor = (e: any, key: ExportColumnKey, pause: { prevEnd: string; thisStart: string; gapMinutes: number } | null): string => {
    const realIntervals = Array.isArray(e.pause_intervals) ? e.pause_intervals as { paused_at: string; resumed_at: string | null }[] : [];
    const firstReal = realIntervals.length > 0 ? realIntervals[0] : null;
    switch (key) {
      case "clock_in": return formatClock(e.start_time);
      case "clock_out": return formatClock(e.end_time);
      case "pause_start": return firstReal ? formatClock(firstReal.paused_at) : (pause ? formatClock(pause.prevEnd) : "—");
      case "pause_resume": return firstReal ? formatClock(firstReal.resumed_at) : (pause ? formatClock(pause.thisStart) : "—");
      case "pause_total": {
        const interSession = pause?.gapMinutes ?? 0;
        const withinSession = e.break_minutes ?? 0;
        const total = interSession + withinSession;
        return total > 0 ? formatDur(total) : "—";
      }
      case "location": return e.end_on_site != null ? (e.end_on_site ? "On-site" : "Off-site") : "—";
      case "project": return e.project_name ?? "—";
      case "task": return e.task_name ?? "—";
      case "notes": return e.notes ?? "—";
    }
  };

  const handleApprove = async () => {
    if (!report) return;
    setWorking(true);
    const { error } = await supabase
      .from("submitted_reports")
      .update({ status: "approved" } as any)
      .eq("id", report.id);
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Report approved.");
    onReviewed?.();
    onOpenChange(false);
  };

  const handleReject = async () => {
    if (!report) return;
    if (reason === "other" && note.trim().length === 0) {
      toast.error("Please add a note explaining the rejection.");
      return;
    }
    setWorking(true);
    const { error } = await supabase
      .from("submitted_reports")
      .update({
        status: "rejected",
        rejection_reason: reason,
        rejection_note: note.trim() || null,
      } as any)
      .eq("id", report.id);
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Report rejected. The contractor has been notified.");
    setRejectOpen(false);
    setNote("");
    setReason("missing_session");
    onReviewed?.();
    onOpenChange(false);
  };

  if (!report) return null;

  const totalMins = Math.round(Number(report.total_hours) * 60);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-2">
            <SheetTitle>{report.client_name ?? "Submitted report"}</SheetTitle>
          </SheetHeader>

          <div className="px-6 pb-6 space-y-4">
            <div className="rounded-xl bg-muted/50 p-4 space-y-1">
              <p className="text-2xl font-bold font-mono text-foreground">{sym}{Number(report.total_amount).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Amount</p>
              <p className="text-xs text-muted-foreground pt-1">
                {formatDate(report.period_start)} – {formatDate(report.period_end)} · {formatHM(totalMins)}
              </p>
              {report.status === "rejected" && (
                <p className="text-[11px] text-destructive">
                  Reason: {REJECT_REASONS.find((r) => r.value === report.rejection_reason)?.label ?? report.rejection_reason}
                  {report.rejection_note ? ` — ${report.rejection_note}` : ""}
                </p>
              )}
            </div>

            {/* Mobile portrait: stacked cards */}
            <div className="sm:hidden space-y-2">
              {entries.length === 0 ? (
                <p className="rounded-xl border border-border px-3 py-4 text-xs text-muted-foreground text-center">No entries.</p>
              ) : (
                entries.map((e: any, idx: number) => {
                  const mins = e.duration_minutes ?? 0;
                  const amt = e.billable_value ?? 0;
                  return (
                    <div key={e.id ?? idx} className="rounded-xl border border-border p-3 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {e.entry_date ? new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">{formatDur(mins)}</span>
                        <span className="text-sm font-mono font-semibold ml-auto">{amt > 0 ? `${sym}${Number(amt).toFixed(2)}` : "—"}</span>
                      </div>
                      {orderedCols.length > 0 && (
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          {orderedCols.map((k) => (
                            <div key={k} className="min-w-0">
                              <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                              <dd className="truncate font-medium">{cellFor(e, k, pauseInfo[idx])}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Tablet / landscape / desktop: wide table with horizontal scroll fallback */}
            <div className="hidden sm:block rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid text-xs font-medium bg-muted/40 px-3 py-2" style={{ gridTemplateColumns: `repeat(${2 + orderedCols.length + 1}, minmax(0,1fr))` }}>
                    <span>Date</span>
                    <span>Time</span>
                    {orderedCols.map((k) => (
                      <span key={k} className="capitalize">{k.replace(/_/g, " ")}</span>
                    ))}
                    <span className="text-right">Amount</span>
                  </div>
                  {entries.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground text-center">No entries.</p>
                  ) : (
                    entries.map((e: any, idx: number) => {
                      const mins = e.duration_minutes ?? 0;
                      const amt = e.billable_value ?? 0;
                      return (
                        <div key={e.id ?? idx} className="grid text-xs px-3 py-2 border-t border-border" style={{ gridTemplateColumns: `repeat(${2 + orderedCols.length + 1}, minmax(0,1fr))` }}>
                          <span>{e.entry_date ? new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}</span>
                          <span className="font-mono">{formatDur(mins)}</span>
                          {orderedCols.map((k) => (
                            <span key={k} className="truncate">{cellFor(e, k, pauseInfo[idx])}</span>
                          ))}
                          <span className="text-right font-mono">{amt > 0 ? `${sym}${Number(amt).toFixed(2)}` : "—"}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {!readOnly && report.status === "submitted" && (
              <div className="space-y-2">
                <Button
                  className="w-full rounded-xl h-12 gap-2 justify-center font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleApprove}
                  disabled={working}
                >
                  <Check className="w-4 h-4" /> Approve
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl h-12 gap-2 justify-center font-medium"
                  onClick={() => setRejectOpen(true)}
                  disabled={working}
                >
                  <X className="w-4 h-4" /> Reject
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent className="rounded-2xl w-[calc(100vw-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject report</AlertDialogTitle>
            <AlertDialogDescription>
              The contractor will be notified with your reason and can edit and resubmit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <RadioGroup value={reason} onValueChange={setReason}>
              {REJECT_REASONS.map((r) => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                  <Label htmlFor={`reason-${r.value}`} className="text-sm font-normal">{r.label}</Label>
                </div>
              ))}
            </RadioGroup>
            <Textarea
              placeholder={reason === "other" ? "Required — describe the issue" : "Optional note for the contractor"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={working}>
              {working ? "Rejecting…" : "Reject report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SubmittedReportSheet;
