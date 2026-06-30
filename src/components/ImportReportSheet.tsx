import { useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FileUp, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  parseTraceReportFile,
  TraceImportError,
  type TraceReportPayload,
} from "@/lib/trace-report-import";

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF",
};

const fmtDate = (s: string) => {
  try {
    return new Date(s + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return s; }
};

const fmtHM = (h: number) => {
  const total = Math.round(h * 60);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours}h${String(mins).padStart(2, "0")}`;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  onImported?: () => void;
}

const ImportReportSheet = ({ open, onOpenChange, clientId, clientName, onImported }: Props) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [payload, setPayload] = useState<TraceReportPayload | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const reset = () => {
    setPayload(null);
    setFileName(null);
    setParsing(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setPayload(null);
    setFileName(file.name);
    try {
      const p = await parseTraceReportFile(file);
      setPayload(p);
    } catch (err) {
      const msg = err instanceof TraceImportError
        ? err.message
        : "Couldn't read that file.";
      toast.error(msg);
      setFileName(null);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!user || !payload) return;
    setImporting(true);
    try {
      const { error } = await supabase.from("submitted_reports").insert({
        worker_user_id: user.id,        // placeholder — no connected worker
        employer_user_id: user.id,
        client_id: clientId,
        period_start: payload.period_start,
        period_end: payload.period_end,
        total_hours: payload.total_hours,
        total_amount: payload.total_amount,
        currency: payload.currency,
        shared_columns: payload.shared_columns as any,
        entries_snapshot: payload.entries as any,
        status: "approved",
        reviewed_at: new Date().toISOString(),
        source: "imported",
      } as any);
      if (error) throw error;
      toast.success("Report imported. Added to Payments Due.");
      onImported?.();
      handleClose(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't import the report.");
    } finally {
      setImporting(false);
    }
  };

  const sym = payload ? (CURRENCY_SYMBOLS[payload.currency] ?? payload.currency) : "";

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Import report</SheetTitle>
          <SheetDescription>
            Upload a Trace PDF that {clientName} sent you. The report will be added to
            Payments Due, already approved.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {!payload && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-foreground/40 transition-colors p-6 flex flex-col items-center gap-2 text-center disabled:opacity-60"
            >
              <FileUp className="w-6 h-6 text-muted-foreground" />
              <div className="text-sm font-medium">
                {parsing ? "Reading PDF…" : fileName ? "Choose another file" : "Choose Trace PDF"}
              </div>
              <div className="text-xs text-muted-foreground">
                Only Trace-generated PDFs are supported in this version.
              </div>
            </button>
          )}

          {payload && (
            <>
              <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-nav-bg" />
                  Trace report detected
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                  <span className="text-muted-foreground">Freelancer</span>
                  <span className="font-medium text-right truncate">
                    {payload.worker.name || payload.worker.email || "—"}
                  </span>
                  <span className="text-muted-foreground">Original client</span>
                  <span className="font-medium text-right truncate">{payload.client.name}</span>
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium text-right">
                    {fmtDate(payload.period_start)} – {fmtDate(payload.period_end)}
                  </span>
                  <span className="text-muted-foreground">Sessions</span>
                  <span className="font-medium text-right font-mono">{payload.entries.length}</span>
                  <span className="text-muted-foreground">Total hours</span>
                  <span className="font-medium text-right font-mono">{fmtHM(payload.total_hours)}</span>
                  <span className="text-muted-foreground">Amount due</span>
                  <span className="font-semibold text-right font-mono">
                    {sym}{payload.total_amount.toFixed(2)}
                  </span>
                </div>
              </div>

              {payload.client.name &&
                payload.client.name.toLowerCase() !== clientName.toLowerCase() && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 p-3 text-xs">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      The PDF was issued to <b>{payload.client.name}</b>, but you're importing
                      it under <b>{clientName}</b>. Continue only if these refer to the same engagement.
                    </span>
                  </div>
                )}

              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> {fileName}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={reset} disabled={importing}>
                  Choose another
                </Button>
                <Button className="flex-1 rounded-xl" onClick={handleConfirm} disabled={importing}>
                  {importing ? "Importing…" : "Import report"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ImportReportSheet;
