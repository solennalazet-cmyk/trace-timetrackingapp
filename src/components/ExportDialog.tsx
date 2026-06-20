import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, FileText, FileSpreadsheet, Wallet, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DateRangePicker from "@/components/DateRangePicker";
import { toLocalDateKey } from "@/lib/utils";
import { type RoundingSettings, roundDuration, roundedBillableValue, rawBillableValue, hasActiveRounding, describeRounding, aggregateWithRounding, entryDisplayValues } from "@/lib/rounding";
import type { TimeEntry } from "@/components/EntryDetailSheet";
// jspdf + jspdf-autotable are loaded on demand (see exportPDF) so they stay
// out of the initial Android WebView bundle — they only matter once the
// user actually exports something.


interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateFrom: Date;
  dateTo: Date;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  entries: TimeEntry[];
  clients: Record<string, string>;
  projects: Record<string, string>;
  tasks: Record<string, string>;
  clientFilter: string;
  clientIds: string[];
  rounding: RoundingSettings;
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const ExportDialog = ({
  open, onOpenChange,
  dateFrom, dateTo, weekStartsOn,
  entries, clients, projects, tasks,
  clientFilter, clientIds, rounding,
}: ExportDialogProps) => {
  const { user, profile } = useAuth();

  const hadPreFilter = !!clientFilter && clientFilter !== "all";
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [exportFrom, setExportFrom] = useState(dateFrom);
  const [exportTo, setExportTo] = useState(dateTo);
  const [selectedClient, setSelectedClient] = useState(clientFilter || "all");
  const [clientChosen, setClientChosen] = useState(hadPreFilter);
  const [showBusiness, setShowBusiness] = useState(profile?.show_business_on_export !== false);

  // Post-export tracking prompt state
  interface TrackGroup {
    clientId: string;
    clientName: string;
    entries: TimeEntry[];
    totalMinutes: number;
    totalValue: number;
    currency: string;
    selected: boolean;
  }
  const [trackPromptOpen, setTrackPromptOpen] = useState(false);
  const [trackGroups, setTrackGroups] = useState<TrackGroup[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [trackSubmitting, setTrackSubmitting] = useState(false);

  // Sync dates when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setExportFrom(dateFrom);
      setExportTo(dateTo);
      setSelectedClient(clientFilter || "all");
      setClientChosen(hadPreFilter);
      setShowBusiness(profile?.show_business_on_export !== false);
    }
    onOpenChange(v);
  };

  const rangeStart = toLocalDateKey(exportFrom);
  const rangeEnd = toLocalDateKey(exportTo);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const inRange = (e.entry_date ?? "") >= rangeStart && (e.entry_date ?? "") <= rangeEnd;
      const matchesClient = selectedClient === "all" || e.client_id === selectedClient;
      return inRange && matchesClient;
    });
  }, [entries, rangeStart, rangeEnd, selectedClient]);

  // Scope-aware helpers
  const ev = (e: TimeEntry) => entryDisplayValues(e, rounding);
  const isRounding = hasActiveRounding(rounding);
  const roundingDesc = describeRounding(rounding);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const evaluateTrackingPrompt = () => {
    const billable = filteredEntries.filter((e) => e.billable);
    if (billable.length === 0) {
      onOpenChange(false);
      return;
    }
    let unassigned = 0;
    const byClient = new Map<string, TimeEntry[]>();
    for (const e of billable) {
      if (!e.client_id) { unassigned++; continue; }
      if (!byClient.has(e.client_id)) byClient.set(e.client_id, []);
      byClient.get(e.client_id)!.push(e);
    }
    const groups: TrackGroup[] = Array.from(byClient.entries()).map(([clientId, es]) => {
      const { totalMinutes, totalValue } = aggregateWithRounding(es, rounding);
      const currency = es.find((x) => x.rate_currency)?.rate_currency ?? "EUR";
      return {
        clientId,
        clientName: clients[clientId] ?? "Client",
        entries: es,
        totalMinutes,
        totalValue,
        currency,
        selected: true,
      };
    });
    if (groups.length === 0 && unassigned === 0) {
      onOpenChange(false);
      return;
    }
    setTrackGroups(groups);
    setUnassignedCount(unassigned);
    setTrackPromptOpen(true);
  };

  const handleExport = async () => {
    if (filteredEntries.length === 0) {
      toast.error("No entries to export for this range.");
      return;
    }
    if (format === "csv") exportCSV();
    else await exportPDF();
    // Don't auto-close — show tracking prompt next
    evaluateTrackingPrompt();
  };


  const handleConfirmTrack = async () => {
    if (!user) {
      // Signed-out users can't write to Payments — close prompt and nudge sign-in.
      setTrackPromptOpen(false);
      onOpenChange(false);
      toast.info("Sign in to track exported reports in Payments.");
      return;
    }
    const chosen = trackGroups.filter((g) => g.selected);
    if (chosen.length === 0) {
      setTrackPromptOpen(false);
      onOpenChange(false);
      return;
    }
    setTrackSubmitting(true);
    try {
      const clientIdsToCheck = chosen.map((g) => g.clientId);
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, connected_user_id, connection_status, currency")
        .in("id", clientIdsToCheck);
      const cMap = new Map((clientRows ?? []).map((c: any) => [c.id, c]));

      const inserts = chosen.map((g) => {
        const c = cMap.get(g.clientId);
        const connected = c?.connection_status === "accepted" ? c?.connected_user_id ?? null : null;
        return {
          worker_user_id: user.id,
          employer_user_id: connected,
          client_id: g.clientId,
          period_start: rangeStart,
          period_end: rangeEnd,
          total_hours: Number((g.totalMinutes / 60).toFixed(2)),
          total_amount: Number(g.totalValue.toFixed(2)),
          currency: g.currency ?? c?.currency ?? "EUR",
          shared_columns: [] as any,
          entries_snapshot: g.entries as any,
          // Connected → 'submitted' (employer can review). Solo → 'approved' (no employer to review).
          status: connected ? "submitted" : "approved",
          reviewed_at: connected ? null : new Date().toISOString(),
        } as any;
      });

      const { error } = await supabase.from("submitted_reports").insert(inserts);
      if (error) throw error;
      toast.success(chosen.length === 1 ? "Tracked in Payments." : `Tracked ${chosen.length} reports in Payments.`);
      setTrackPromptOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't track in Payments.");
    } finally {
      setTrackSubmitting(false);
    }
  };

  const handleSkipTrack = () => {
    setTrackPromptOpen(false);
    onOpenChange(false);
  };

  const exportCSV = () => {
    const { totalMinutes, totalValue } = aggregateWithRounding(filteredEntries, rounding);
    const headers = "Date,Client,Project,Task,Duration (min),Duration (hh:mm),Billable,Rate,Value,Notes,Tags,Type";
    const rows = filteredEntries.map((e) => {
      const { displayMinutes, displayValue } = ev(e);
      return [
        e.entry_date,
        (e.client_name ?? "").replace(/,/g, " "),
        (e.project_name ?? "").replace(/,/g, " "),
        (e.task_name ?? "").replace(/,/g, " "),
        displayMinutes,
        formatDuration(displayMinutes),
        e.billable ? "Yes" : "No",
        e.rate_amount ?? "",
        displayValue.toFixed(2),
        `"${(e.notes ?? "").replace(/"/g, '""')}"`,
        (e.tags ?? []).join(";"),
        e.entry_type ?? "",
      ].join(",");
    });
    let csv = headers + "\n" + rows.join("\n");
    // Add totals row
    csv += `\n\nTotal,,,,,${formatDuration(totalMinutes)},,,${totalValue.toFixed(2)}`;
    if (isRounding) {
      csv += `\nRounding: ${roundingDesc}`;
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-report-${rangeStart}-to-${rangeEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported.");
  };

  const exportPDF = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = margin;

    // Scope-aware totals
    const { totalMinutes: totalMins, totalValue } = aggregateWithRounding(filteredEntries, rounding);

    // ── Trace logo (top-right) ──
    const rightX = pageW - margin;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 140, 40);
    doc.text("trace", rightX, margin + 2, { align: "right" });
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140);
    doc.text("trace.lla-studio.com", rightX, margin + 6, { align: "right" });

    // ── User details (top-left) ──
    if (showBusiness && profile) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      const bizName = profile.business_name || profile.full_name || "";
      if (bizName) {
        doc.text(bizName, margin, y);
        y += 6;
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      if (profile.business_address) {
        const addrLines = profile.business_address.split("\n");
        addrLines.forEach((line) => {
          doc.text(line, margin, y);
          y += 4;
        });
      }
      if (profile.tax_id) {
        doc.text(`Tax ID: ${profile.tax_id}`, margin, y);
        y += 4;
      }
      if (user?.email) {
        doc.text(user.email, margin, y);
        y += 4;
      }
    }

    y = Math.max(y, margin + 20) + 6;

    // ── Client details (below user, left-aligned) ──
    const clientName = selectedClient !== "all" ? (clients[selectedClient] ?? "") : "";
    if (clientName) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80);
      doc.text("To:", margin, y);
      doc.setFontSize(11);
      doc.setTextColor(40);
      doc.text(clientName, margin + 8, y);
      y += 8;
    }

    // ── Object / title line ──
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    const fromLabel = new Date(rangeStart + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const toLabel = new Date(rangeEnd + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    doc.text(`Time Report: ${fromLabel} – ${toLabel}`, margin, y);
    y += 8;

    // ── Summary (post-rounding only) ──
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(`Total: ${(totalMins / 60).toFixed(2)} hours  ·  ${filteredEntries.length} entries  ·  Billable: €${totalValue.toFixed(2)}`, margin, y);
    y += 4;
    if (isRounding) {
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(`Rounding applied: ${roundingDesc}`, margin, y);
      y += 4;
    }

    // Separator
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // ── Table (shows per-entry display values) ──
    const tableHead = [["Date", "Duration", "Project", "Task", "Billable", "Value"]];
    const tableBody = filteredEntries
      .sort((a, b) => (a.entry_date ?? "").localeCompare(b.entry_date ?? ""))
      .map((e) => {
        const { displayMinutes, displayValue } = ev(e);
        return [
          e.entry_date ? new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "",
          formatDuration(displayMinutes),
          e.project_name ?? "",
          e.task_name ?? "",
          e.billable ? "Yes" : "—",
          displayValue > 0 ? `€${displayValue.toFixed(2)}` : "—",
        ];
      });

    autoTable(doc, {
      startY: y,
      head: tableHead,
      body: tableBody,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [50, 50, 50] },
      headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "bold", lineColor: [220, 220, 220], lineWidth: 0.3 },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      theme: "grid",
      tableLineColor: [230, 230, 230],
      tableLineWidth: 0.2,
    });

    // ── Footer on every page ──
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text("Generated with Trace  ·  trace.lla-studio.com", pageW / 2, pageH - 8, { align: "center" });
      doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 8, { align: "right" });
    }

    doc.save(`trace-report-${rangeStart}-to-${rangeEnd}.pdf`);
    toast.success("PDF exported.");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[420px] rounded-2xl p-0" position="sheet">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Export Report</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-5">
          {/* Client picker — shown first when no pre-filter */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Client</Label>
            <Select
              value={clientChosen ? selectedClient : ""}
              onValueChange={(v) => { setSelectedClient(v); setClientChosen(true); }}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientIds.map((id) => (
                  <SelectItem key={id} value={id}>{clients[id] ?? "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!clientChosen && (
              <p className="text-xs text-muted-foreground mt-2">
                Pick a client (or “All clients”) to continue.
              </p>
            )}
          </div>

          {clientChosen && (
            <>
              {/* Format */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Format</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormat("pdf")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      format === "pdf"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button
                    onClick={() => setFormat("csv")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      format === "csv"
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" /> CSV
                  </button>
                </div>
              </div>

              {/* Date range */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Date Range</Label>
                <DateRangePicker
                  from={exportFrom}
                  to={exportTo}
                  onChange={(f, t) => { setExportFrom(f); setExportTo(t); }}
                  weekStartsOn={weekStartsOn}
                />
              </div>

              {/* Business details toggle (PDF only) */}
              {format === "pdf" && profile?.business_name && (
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Include my business details</Label>
                  <Switch checked={showBusiness} onCheckedChange={setShowBusiness} />
                </div>
              )}

              {/* Entry count preview */}
              <p className="text-xs text-muted-foreground">
                {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"} in selection
              </p>
            </>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button
            className="w-full rounded-[28px] h-12 font-bold gap-2"
            onClick={handleExport}
            disabled={!clientChosen || filteredEntries.length === 0}
          >
            <Download className="w-4 h-4" />
            Export {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Post-export: Track in Payments prompt */}
      <AlertDialog open={trackPromptOpen} onOpenChange={setTrackPromptOpen}>
        <AlertDialogContent className="max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-nav-bg" />
              Track this report in Payments?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {trackGroups.length > 0
                ? "You can record payments against this report from the Payments tab."
                : "All sessions in this export are unassigned."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {trackGroups.length > 0 && (
            <div className="space-y-2 my-2">
              {trackGroups.map((g) => {
                const sym = CURRENCY_SYMBOLS[g.currency] ?? "€";
                return (
                  <label
                    key={g.clientId}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={g.selected}
                      onCheckedChange={(v) =>
                        setTrackGroups((prev) =>
                          prev.map((x) => (x.clientId === g.clientId ? { ...x, selected: !!v } : x))
                        )
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.clientName}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {formatDuration(g.totalMinutes)} · {sym}{g.totalValue.toFixed(2)}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {unassignedCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                <span className="font-semibold">{unassignedCount}</span> billable {unassignedCount === 1 ? "session is" : "sessions are"} not assigned to a client and can't be tracked. Assign them in the Timeline tab, then export again.
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipTrack} disabled={trackSubmitting}>
              {trackGroups.length === 0 ? "Close" : "No thanks"}
            </AlertDialogCancel>
            {trackGroups.length > 0 && (
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleConfirmTrack(); }}
                disabled={trackSubmitting || !trackGroups.some((g) => g.selected)}
              >
                {trackSubmitting ? "Tracking…" : "Yes, track"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default ExportDialog;
