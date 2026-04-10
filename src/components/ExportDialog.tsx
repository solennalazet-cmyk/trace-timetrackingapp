import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DateRangePicker from "@/components/DateRangePicker";
import { toLocalDateKey } from "@/lib/utils";
import { type RoundingSettings, roundDuration, roundedBillableValue } from "@/lib/rounding";
import type { TimeEntry } from "@/components/EntryDetailSheet";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [exportFrom, setExportFrom] = useState(dateFrom);
  const [exportTo, setExportTo] = useState(dateTo);
  const [selectedClient, setSelectedClient] = useState(clientFilter || "all");
  const [showBusiness, setShowBusiness] = useState(profile?.show_business_on_export !== false);

  // Sync dates when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setExportFrom(dateFrom);
      setExportTo(dateTo);
      setSelectedClient(clientFilter || "all");
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

  const rd = (mins: number) => roundDuration(mins, rounding);
  const rawValue = (e: TimeEntry) => roundedBillableValue(e.duration_minutes, e.rate_amount ?? null, e.rate_unit ?? null, e.billable ?? false, { ...rounding, round_duration: "none", round_amount: "none" });
  const rv = (e: TimeEntry) => roundedBillableValue(e.duration_minutes, e.rate_amount ?? null, e.rate_unit ?? null, e.billable ?? false, rounding);

  const hasRounding = rounding.round_duration !== "none" || rounding.round_amount !== "none";

  const describeRounding = (): string => {
    const parts: string[] = [];
    if (rounding.round_duration !== "none") {
      parts.push(`durations rounded ${rounding.round_duration} to ${rounding.round_duration_to} min`);
    }
    if (rounding.round_amount !== "none") {
      parts.push(`amounts rounded ${rounding.round_amount === "nearest" ? "to the nearest" : rounding.round_amount} ${rounding.round_amount_to < 1 ? rounding.round_amount_to.toString() : "€" + rounding.round_amount_to}`);
    }
    return parts.join(", ");
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const handleExport = () => {
    if (filteredEntries.length === 0) {
      toast.error("No entries to export for this range.");
      return;
    }
    if (format === "csv") exportCSV();
    else exportPDF();
    onOpenChange(false);
  };

  const exportCSV = () => {
    const headers = "Date,Client,Project,Task,Duration (min),Duration (hh:mm),Billable,Rate,Value,Notes,Tags,Type";
    const rows = filteredEntries.map((e) => [
      e.entry_date,
      (e.client_name ?? "").replace(/,/g, " "),
      (e.project_name ?? "").replace(/,/g, " "),
      (e.task_name ?? "").replace(/,/g, " "),
      rd(e.duration_minutes),
      formatDuration(rd(e.duration_minutes)),
      e.billable ? "Yes" : "No",
      e.rate_amount ?? "",
      rv(e).toFixed(2),
      `"${(e.notes ?? "").replace(/"/g, '""')}"`,
      (e.tags ?? []).join(";"),
      e.entry_type ?? "",
    ].join(","));
    let csv = headers + "\n" + rows.join("\n");
    if (hasRounding) {
      const rawTotalMins = filteredEntries.reduce((s, e) => s + e.duration_minutes, 0);
      const rawTotalValue = filteredEntries.reduce((s, e) => s + rawValue(e), 0);
      const roundedTotalMins = filteredEntries.reduce((s, e) => s + rd(e.duration_minutes), 0);
      const roundedTotalValue = filteredEntries.reduce((s, e) => s + rv(e), 0);
      csv += `\n\nRounding: ${describeRounding()}`;
      csv += `\nActual total,,,,,${formatDuration(rawTotalMins)},,,${rawTotalValue.toFixed(2)}`;
      csv += `\nRounded total,,,,,${formatDuration(roundedTotalMins)},,,${roundedTotalValue.toFixed(2)}`;
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

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = margin;

    // ── User details (top-left) ──
    if (showBusiness && profile) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
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

    // ── Client details (top-right) ──
    const clientName = selectedClient !== "all" ? (clients[selectedClient] ?? "") : "";
    if (clientName) {
      const rightX = pageW - margin;
      const clientY = margin;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40);
      doc.text(clientName, rightX, clientY, { align: "right" });
    }

    y = Math.max(y, margin + 20) + 6;

    // ── Object / title line ──
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    const fromLabel = new Date(rangeStart + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const toLabel = new Date(rangeEnd + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    doc.text(`Time Report: ${fromLabel} – ${toLabel}`, margin, y);
    y += 8;

    // ── Summary ──
    const totalMins = filteredEntries.reduce((s, e) => s + rd(e.duration_minutes), 0);
    const rawTotalMins = filteredEntries.reduce((s, e) => s + e.duration_minutes, 0);
    const totalValue = filteredEntries.reduce((s, e) => s + rv(e), 0);
    const rawTotalValue = filteredEntries.reduce((s, e) => s + rawValue(e), 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);

    if (hasRounding) {
      const rawH = (rawTotalMins / 60).toFixed(2);
      const roundedH = (totalMins / 60).toFixed(2);
      doc.text(`Total: ${roundedH} hours (${rawH} actual)  ·  ${filteredEntries.length} entries  ·  Billable: €${totalValue.toFixed(2)} (€${rawTotalValue.toFixed(2)} actual)`, margin, y);
      y += 4;
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(`Rounding applied: ${describeRounding()}`, margin, y);
      y += 4;
    } else {
      doc.text(`Total: ${formatDuration(totalMins)}  ·  ${filteredEntries.length} entries  ·  Billable value: €${totalValue.toFixed(2)}`, margin, y);
      y += 4;
    }

    // Separator
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // ── Table ──
    const tableHead = [["Date", "Duration", "Project", "Task", "Notes", "Billable", "Value"]];
    const tableBody = filteredEntries
      .sort((a, b) => (a.entry_date ?? "").localeCompare(b.entry_date ?? ""))
      .map((e) => [
        e.entry_date ? new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "",
        formatDuration(rd(e.duration_minutes)),
        e.project_name ?? "",
        e.task_name ?? "",
        (e.notes ?? "").slice(0, 60),
        e.billable ? "Yes" : "—",
        rv(e) > 0 ? `€${rv(e).toFixed(2)}` : "—",
      ]);

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
      doc.text("Generated with Trace", pageW / 2, pageH - 8, { align: "center" });
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

          {/* Client */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Client</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientIds.map((id) => (
                  <SelectItem key={id} value={id}>{clients[id] ?? "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button
            className="w-full rounded-[28px] h-12 font-bold gap-2"
            onClick={handleExport}
            disabled={filteredEntries.length === 0}
          >
            <Download className="w-4 h-4" />
            Export {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
