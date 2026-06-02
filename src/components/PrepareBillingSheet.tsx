import { useState, useMemo, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileText, Share2, Copy, CheckCircle2, ChevronDown, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type RoundingSettings, aggregateWithRounding, entryDisplayValues, hasActiveRounding, describeRounding } from "@/lib/rounding";
import type { TimeEntry } from "@/components/EntryDetailSheet";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExportColumnsPicker from "@/components/ExportColumnsPicker";
import { type ExportColumnKey, resolveExportColumns, EXPORT_COLUMN_OPTIONS } from "@/lib/export-columns";
import { cn } from "@/lib/utils";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const formatHM = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
};

const formatDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatClock = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};

interface PrepareBillingSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  clientCurrency: string;
  entries: TimeEntry[];
  rounding: RoundingSettings;
  dateFrom: Date;
  dateTo: Date;
  onComplete?: () => void;
}

const PrepareBillingSheet = ({
  open, onOpenChange,
  clientId, clientName, clientCurrency,
  entries, rounding, dateFrom, dateTo, onComplete,
}: PrepareBillingSheetProps) => {
  const { user, profile } = useAuth();
  const [showBilledPrompt, setShowBilledPrompt] = useState(false);
  const [markingBilled, setMarkingBilled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<ExportColumnKey[]>([]);
  const [columnsLoaded, setColumnsLoaded] = useState(false);
  const [clientHasSite, setClientHasSite] = useState(false);
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [connectedUserId, setConnectedUserId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("none");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sym = CURRENCY_SYMBOLS[clientCurrency] ?? "€";

  // Load saved export column prefs + site presence + connection state for this client
  useEffect(() => {
    if (!open || !user) return;
    setColumnsLoaded(false);
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("export_columns, site_lat, site_lng, email, connected_user_id, connection_status")
        .eq("id", clientId)
        .maybeSingle();
      setSelectedColumns(resolveExportColumns((data as any)?.export_columns ?? null));
      setClientHasSite(
        (data as any)?.site_lat != null && (data as any)?.site_lng != null
      );
      setClientEmail((data as any)?.email ?? null);
      setConnectedUserId((data as any)?.connected_user_id ?? null);
      setConnectionStatus((data as any)?.connection_status ?? "none");
      setColumnsLoaded(true);
    })();
  }, [open, user, clientId]);

  // Persist on change (debounced via microtask — column toggles are infrequent)
  const handleColumnsChange = (next: ExportColumnKey[]) => {
    setSelectedColumns(next);
    if (!user || !columnsLoaded) return;
    supabase.from("clients").update({ export_columns: next as any }).eq("id", clientId).then(() => {});
  };

  const { billableEntries, billableMins, billableValue, totalMins, unbillableMins } = useMemo(() => {
    const billable = entries.filter((e) => e.billable);
    const unbillable = entries.filter((e) => !e.billable);
    const { totalMinutes: bMins, totalValue: bVal } = aggregateWithRounding(billable, rounding);
    const { totalMinutes: tMins } = aggregateWithRounding(entries, rounding);
    const { totalMinutes: uMins } = aggregateWithRounding(unbillable, rounding);
    return { billableEntries: billable, billableMins: bMins, billableValue: bVal, totalMins: tMins, unbillableMins: uMins };
  }, [entries, rounding]);

  const unbilledBillableEntries = useMemo(
    () => billableEntries.filter((e) => e.billing_status === "unbilled"),
    [billableEntries]
  );

  // Entries to include in the shared report. When the project/client has no
  // billable entries, fall back to all entries so unbillable work can still be
  // sent/exported (just without monetary amounts).
  const reportEntries = billableEntries.length > 0 ? billableEntries : entries;

  const rangeStart = dateFrom.toISOString().split("T")[0];
  const rangeEnd = dateTo.toISOString().split("T")[0];
  const fromLabel = dateFrom.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const toLabel = dateTo.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const buildPDF = () => {
    // Auto-landscape when many optional columns selected (always-on: Date, Duration, Amount).
    const totalCols = 3 + selectedColumns.length;
    const orientation: "portrait" | "landscape" = totalCols > 5 ? "landscape" : "portrait";

    const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = margin;

    const rightX = pageW - margin;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 140, 40);
    doc.text("trace", rightX, margin + 2, { align: "right" });
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140);
    doc.text("trace.lla-studio.com", rightX, margin + 6, { align: "right" });

    if (profile) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      const bizName = profile.business_name || profile.full_name || "";
      if (bizName) { doc.text(bizName, margin, y); y += 6; }
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      if (user?.email) { doc.text(user.email, margin, y); y += 4; }
      if (profile.phone) { doc.text(profile.phone, margin, y); y += 4; }
      if (profile.business_address) {
        profile.business_address.split("\n").forEach((line) => { doc.text(line, margin, y); y += 4; });
      }
      if (profile.tax_id) { doc.text(`Tax ID: ${profile.tax_id}`, margin, y); y += 4; }
    }

    y = Math.max(y, margin + 20) + 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("To:", margin, y);
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(clientName, margin + 8, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    doc.text(`Billing Summary: ${fromLabel} – ${toLabel}`, margin, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(`Billable time: ${formatHM(billableMins)}`, margin, y); y += 4;
    doc.text(`Total worked: ${formatHM(totalMins)}`, margin, y); y += 4;
    if (unbillableMins > 0) { doc.text(`Unbillable: ${formatHM(unbillableMins)}`, margin, y); y += 4; }
    y += 2;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    doc.text(`Amount due: ${sym}${billableValue.toFixed(2)}`, margin, y);
    y += 8;

    if (hasActiveRounding(rounding)) {
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(`Rounding: ${describeRounding(rounding)}`, margin, y);
      y += 4;
    }

    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // Build dynamic columns
    const optionalHeaders: Record<ExportColumnKey, string> = {
      clock_in: "Clock in",
      clock_out: "Clock out",
      pause_start: "Pause start",
      pause_resume: "Pause resume",
      pause_total: "Pause total",
      location: "Location",
      project: "Project",
      task: "Task",
      notes: "Notes",
    };
    // Preserve canonical option order
    const orderedOptional = EXPORT_COLUMN_OPTIONS
      .filter((o) => selectedColumns.includes(o.key))
      .map((o) => o.key);

    const head = ["Date", "Duration", ...orderedOptional.map((k) => optionalHeaders[k]), "Amount"];

    // Sort by date, then by start_time so same-day sessions are in chronological order
    const sortedEntries = [...reportEntries].sort((a, b) => {
      const d = (a.entry_date ?? "").localeCompare(b.entry_date ?? "");
      if (d !== 0) return d;
      const aT = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bT = b.start_time ? new Date(b.start_time).getTime() : 0;
      return aT - bT;
    });

    // For each entry, compute the inter-session pause vs. the previous entry on the same day.
    // pauseInfo[i] is filled when entry i has start_time, the previous entry shares the same
    // date and has an end_time, and the gap is > 0.
    type PauseInfo = { prevEnd: string; thisStart: string; gapMinutes: number };
    const pauseInfo: (PauseInfo | null)[] = sortedEntries.map((e, i) => {
      if (i === 0) return null;
      const prev = sortedEntries[i - 1];
      if (!prev.entry_date || !e.entry_date || prev.entry_date !== e.entry_date) return null;
      if (!prev.end_time || !e.start_time) return null;
      const gap = Math.round((new Date(e.start_time).getTime() - new Date(prev.end_time).getTime()) / 60000);
      if (gap <= 0) return null;
      return { prevEnd: prev.end_time, thisStart: e.start_time, gapMinutes: gap };
    });

    const formatLocationCell = (e: TimeEntry): string => {
      // Prefer end (clock out) location; fall back to start (clock in) location
      const lat = (e.end_lat ?? e.start_lat) as number | null | undefined;
      const lng = (e.end_lng ?? e.start_lng) as number | null | undefined;
      const acc = (e.end_accuracy_m ?? e.start_accuracy_m) as number | null | undefined;
      const onSite = (e.end_on_site ?? e.start_on_site) as boolean | null | undefined;
      const dist = (e.end_distance_m ?? e.start_distance_m) as number | null | undefined;
      if (lat == null || lng == null) return "—";
      if (clientHasSite && onSite != null) {
        return onSite ? "On-site" : `Off-site · ${dist ?? "?"}m`;
      }
      // No site set → show raw coordinates (worker may have multiple worksites)
      const base = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      return acc != null ? `${base} (±${acc}m)` : base;
    };

    const cellFor = (e: TimeEntry, key: ExportColumnKey, pause: PauseInfo | null): string => {
      switch (key) {
        case "clock_in": return formatClock(e.start_time);
        case "clock_out": return formatClock(e.end_time);
        case "pause_start": return pause ? formatClock(pause.prevEnd) : "—";
        case "pause_resume": return pause ? formatClock(pause.thisStart) : "—";
        case "pause_total": {
          const interSession = pause?.gapMinutes ?? 0;
          const withinSession = e.break_minutes ?? 0;
          const total = interSession + withinSession;
          return total > 0 ? formatDuration(total) : "—";
        }
        case "location": return formatLocationCell(e);
        case "project": return e.project_name ?? "—";
        case "task": return e.task_name ?? "—";
        case "notes": {
          const n = e.notes ?? "";
          if (!n) return "—";
          return n.length > 60 ? n.slice(0, 57) + "…" : n;
        }
      }
    };

    const body = sortedEntries.map((e, i) => {
      const { displayMinutes, displayValue } = entryDisplayValues(e, rounding);
      const pause = pauseInfo[i];
      return [
        e.entry_date ? new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "",
        formatDuration(displayMinutes),
        ...orderedOptional.map((k) => cellFor(e, k, pause)),
        displayValue > 0 ? `${sym}${displayValue.toFixed(2)}` : "—",
      ];
    });

    // Find location column index in the final table (Date + Duration + optionals + Amount)
    const locationColIndex = orderedOptional.includes("location")
      ? 2 + orderedOptional.indexOf("location")
      : -1;

    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [50, 50, 50], overflow: "linebreak" },
      headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "bold", lineColor: [220, 220, 220], lineWidth: 0.3 },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      theme: "grid",
      tableLineColor: [230, 230, 230],
      tableLineWidth: 0.2,
      didParseCell: (data) => {
        // Color-code the Location column only when the client has a site set
        if (!clientHasSite || locationColIndex < 0) return;
        if (data.section !== "body" || data.column.index !== locationColIndex) return;
        const text = String(data.cell.raw ?? "");
        if (text.startsWith("On-site")) {
          // sage green
          data.cell.styles.fillColor = [219, 234, 224];
          data.cell.styles.textColor = [29, 78, 50];
          data.cell.styles.fontStyle = "bold";
        } else if (text.startsWith("Off-site")) {
          // mustard yellow
          data.cell.styles.fillColor = [250, 232, 187];
          data.cell.styles.textColor = [102, 65, 13];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const paymentLink = profile?.payment_link;
    if (paymentLink) {
      const lastY = (doc as any).lastAutoTable?.finalY ?? y + 20;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40);
      doc.text("Pay here:", margin, lastY + 10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 100, 180);
      doc.textWithLink(paymentLink, margin + 18, lastY + 10, { url: paymentLink });
    }

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text("Generated with Trace  ·  trace.lla-studio.com", pageW / 2, pageH - 8, { align: "center" });
      doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 8, { align: "right" });
    }

    return doc;
  };

  const promptMarkBilled = () => {
    if (unbilledBillableEntries.length > 0) {
      setShowBilledPrompt(true);
    }
  };

  const handleMarkAsBilled = async () => {
    if (!user) return;
    if (billableEntries.length === 0) {
      toast.error("No billable entries to track.");
      return;
    }
    setMarkingBilled(true);
    try {
      // 1. Create the Payments entry (submitted_report)
      const snapshot = billableEntries.map((e) => ({ ...e }));
      const connected = connectionStatus === "accepted" ? connectedUserId : null;
      const { error: insertErr } = await supabase.from("submitted_reports").insert({
        worker_user_id: user.id,
        employer_user_id: connected,
        client_id: clientId,
        period_start: rangeStart,
        period_end: rangeEnd,
        total_hours: Number((billableMins / 60).toFixed(2)),
        total_amount: Number(billableValue.toFixed(2)),
        currency: clientCurrency,
        shared_columns: selectedColumns as any,
        entries_snapshot: snapshot as any,
        // Connected → 'submitted' (employer reviews). Solo → 'approved' (no reviewer).
        status: connected ? "submitted" : "approved",
        reviewed_at: connected ? null : new Date().toISOString(),
      } as any);
      if (insertErr) throw insertErr;

      // 2. Mark the underlying sessions as billed
      const ids = unbilledBillableEntries.map((e) => e.id);
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        await supabase.from("time_entries").update({ billing_status: "billed" }).in("id", chunk);
      }
      toast.success("Added to Payments.");
      onComplete?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add to Payments.");
    }
    setMarkingBilled(false);
    setShowBilledPrompt(false);
  };

  const handleExportPDF = () => {
    if (reportEntries.length === 0) { toast.error("No entries to export."); return; }
    const doc = buildPDF();
    doc.save(`billing-${clientName.replace(/\s+/g, "-")}-${rangeStart}-to-${rangeEnd}.pdf`);
    toast.success("PDF exported.");
    promptMarkBilled();
  };

  const handleSharePDF = async () => {
    if (reportEntries.length === 0) { toast.error("No entries to share."); return; }
    const doc = buildPDF();
    const blob = doc.output("blob");
    const file = new File([blob], `billing-${clientName.replace(/\s+/g, "-")}-${rangeStart}-to-${rangeEnd}.pdf`, { type: "application/pdf" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Billing - ${clientName}` });
        promptMarkBilled();
      } catch (err: any) {
        if (err.name !== "AbortError") toast.error("Share failed.");
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded (share not supported on this device).");
      promptMarkBilled();
    }
  };

  const handleCopySummary = () => {
    const paymentLink = profile?.payment_link;
    const lines = [
      "Hi,",
      "",
      "Here's a summary for this period:",
      "",
      `• ${formatHM(billableMins)} billable work`,
      `• Total: ${sym}${billableValue.toFixed(2)}`,
    ];
    if (paymentLink) { lines.push("", paymentLink); }
    lines.push("", "Let me know if you need a detailed breakdown.", "", "Thanks!");
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Payment summary copied.");
  };

  const isConnected = connectionStatus === "accepted" && !!connectedUserId;

  const handleSubmitToClient = async () => {
    if (!user || !connectedUserId) return;
    if (billableEntries.length === 0) {
      toast.error("No billable entries to submit.");
      return;
    }
    setSubmitting(true);
    try {
      // Snapshot includes ALL fields the consumer might need to render the report.
      const snapshot = billableEntries.map((e) => ({ ...e }));
      const { error } = await supabase.from("submitted_reports").insert({
        worker_user_id: user.id,
        employer_user_id: connectedUserId,
        client_id: clientId,
        period_start: rangeStart,
        period_end: rangeEnd,
        total_hours: Number((billableMins / 60).toFixed(2)),
        total_amount: Number(billableValue.toFixed(2)),
        currency: clientCurrency,
        shared_columns: selectedColumns as any,
        entries_snapshot: snapshot as any,
        status: "submitted",
      } as any);
      if (error) throw error;
      toast.success(`Report submitted to ${clientName}.`);
      setSubmitOpen(false);
      // Mark sessions as billed since they've been submitted for review
      if (unbilledBillableEntries.length > 0) {
        const ids = unbilledBillableEntries.map((e) => e.id);
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          await supabase.from("time_entries").update({ billing_status: "billed" }).in("id", chunk);
        }
      }
      onComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't submit report. Try again.");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto p-0">
          <SheetHeader className="px-6 pt-6 pb-2">
            <SheetTitle>{clientName}</SheetTitle>
          </SheetHeader>

          <div className="px-6 pb-6 space-y-4">
            {/* Summary block */}
            <div className="rounded-xl bg-muted/50 p-4 space-y-2">
              <div>
                <p className="text-2xl font-bold font-mono text-foreground">{sym}{billableValue.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Amount due</p>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="font-mono font-semibold text-foreground">{formatHM(billableMins)}</p>
                  <p className="text-xs text-muted-foreground">Billable</p>
                </div>
                <div>
                  <p className="font-mono font-semibold text-foreground">{formatHM(totalMins)}</p>
                  <p className="text-xs text-muted-foreground">Total worked</p>
                </div>
                {unbillableMins > 0 && (
                  <div>
                    <p className="font-mono font-semibold text-muted-foreground">{formatHM(unbillableMins)}</p>
                    <p className="text-xs text-muted-foreground">Unbillable</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{fromLabel} – {toLabel}</p>
              {hasActiveRounding(rounding) && (
                <p className="text-[11px] text-muted-foreground">Rounding: {describeRounding(rounding)}</p>
              )}
              {unbilledBillableEntries.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {unbilledBillableEntries.length} unbilled session{unbilledBillableEntries.length > 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* Export Settings */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                aria-expanded={settingsOpen}
              >
                <span className="text-sm font-semibold text-foreground">Shared report settings</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", settingsOpen && "rotate-180")} />
              </button>
              {settingsOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Choose the data you want to include in your export. Date, duration and amount are always included.
                  </p>
                  <ExportColumnsPicker value={selectedColumns} onChange={handleColumnsChange} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full rounded-xl h-12 gap-2 justify-start font-medium"
                onClick={handleExportPDF}
                disabled={billableEntries.length === 0}
              >
                <FileText className="w-4 h-4" /> Export PDF
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl h-12 gap-2 justify-start font-medium"
                onClick={handleSharePDF}
                disabled={billableEntries.length === 0}
              >
                <Share2 className="w-4 h-4" /> Share PDF
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl h-12 gap-2 justify-start font-medium"
                onClick={handleCopySummary}
              >
                <Copy className="w-4 h-4" /> Copy payment summary
              </Button>
              <Button
                className="w-full rounded-xl h-12 gap-2 justify-start font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                onClick={() => setSubmitOpen(true)}
                disabled={billableEntries.length === 0 || !isConnected}
                title={isConnected ? undefined : "Client isn't a connected Trace user."}
              >
                <Send className="w-4 h-4" /> Submit to client
                {!isConnected && billableEntries.length > 0 && (
                  <span className="ml-auto text-[10px] font-normal opacity-80">Not connected</span>
                )}
              </Button>
              {unbilledBillableEntries.length > 0 && (
                <Button
                  className="w-full rounded-xl h-12 gap-2 justify-start font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setShowBilledPrompt(true)}
                >
                  Add {unbilledBillableEntries.length} session{unbilledBillableEntries.length > 1 ? "s" : ""} to Payments
                </Button>
              )}
            </div>

            {billableEntries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">No billable entries in this period.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add to Track Payments prompt */}
      <AlertDialog open={showBilledPrompt} onOpenChange={setShowBilledPrompt}>
        <AlertDialogContent className="rounded-2xl max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              Add to Track Payments?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Track {billableEntries.length} billable session{billableEntries.length > 1 ? "s" : ""} for {clientName} in the Payments tab. The sessions will also be marked as billed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingBilled}>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkAsBilled} disabled={markingBilled}>
              {markingBilled ? "Adding…" : "Yes, add to Payments"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit to client confirmation */}
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent className="rounded-2xl max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Submit report?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  This will send the report to {clientName} for review. You can't edit it after submitting.
                </p>
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span className="font-medium text-foreground">{clientName}</span></div>
                  {clientEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium text-foreground truncate ml-2">{clientEmail}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span className="font-medium text-foreground">{fromLabel} – {toLabel}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Hours</span><span className="font-mono font-medium text-foreground">{formatHM(billableMins)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-mono font-medium text-foreground">{sym}{billableValue.toFixed(2)}</span></div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitToClient} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PrepareBillingSheet;
