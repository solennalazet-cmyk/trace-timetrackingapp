import { useState, useMemo } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FileText, Share2, Copy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { type RoundingSettings, DEFAULT_ROUNDING, aggregateWithRounding, entryDisplayValues, hasActiveRounding, describeRounding } from "@/lib/rounding";
import type { TimeEntry } from "@/components/EntryDetailSheet";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
}

const PrepareBillingSheet = ({
  open, onOpenChange,
  clientId, clientName, clientCurrency,
  entries, rounding, dateFrom, dateTo,
}: PrepareBillingSheetProps) => {
  const { user, profile } = useAuth();

  const sym = CURRENCY_SYMBOLS[clientCurrency] ?? "€";

  const { billableEntries, unbillableEntries, billableMins, billableValue, totalMins, unbillableMins } = useMemo(() => {
    const billable = entries.filter((e) => e.billable);
    const unbillable = entries.filter((e) => !e.billable);
    const { totalMinutes: bMins, totalValue: bVal } = aggregateWithRounding(billable, rounding);
    const { totalMinutes: tMins } = aggregateWithRounding(entries, rounding);
    const { totalMinutes: uMins } = aggregateWithRounding(unbillable, rounding);
    return { billableEntries: billable, unbillableEntries: unbillable, billableMins: bMins, billableValue: bVal, totalMins: tMins, unbillableMins: uMins };
  }, [entries, rounding]);

  const rangeStart = dateFrom.toISOString().split("T")[0];
  const rangeEnd = dateTo.toISOString().split("T")[0];
  const fromLabel = dateFrom.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const toLabel = dateTo.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const buildPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = margin;

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

    // ── User billing info (top-left) ──
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
      if ((profile as any).phone) { doc.text((profile as any).phone, margin, y); y += 4; }
      if (profile.business_address) {
        profile.business_address.split("\n").forEach((line) => { doc.text(line, margin, y); y += 4; });
      }
      if (profile.tax_id) { doc.text(`Tax ID: ${profile.tax_id}`, margin, y); y += 4; }
    }

    y = Math.max(y, margin + 20) + 6;

    // ── Client ──
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("To:", margin, y);
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(clientName, margin + 8, y);
    y += 8;

    // ── Date range ──
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    doc.text(`Billing Summary: ${fromLabel} – ${toLabel}`, margin, y);
    y += 8;

    // ── Summary block ──
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

    // Separator
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // ── Table ──
    const ev = (e: TimeEntry) => entryDisplayValues(e, rounding);
    const tableHead = [["Date", "Duration", "Project", "Task", "Notes", "Value"]];
    const tableBody = billableEntries
      .sort((a, b) => (a.entry_date ?? "").localeCompare(b.entry_date ?? ""))
      .map((e) => {
        const { displayMinutes, displayValue } = ev(e);
        return [
          e.entry_date ? new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "",
          formatDuration(displayMinutes),
          e.project_name ?? "",
          e.task_name ?? "",
          (e.notes ?? "").slice(0, 60),
          displayValue > 0 ? `${sym}${displayValue.toFixed(2)}` : "—",
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

    // ── Payment link ──
    const paymentLink = (profile as any)?.payment_link;
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

    // ── Footer ──
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

  const handleExportPDF = () => {
    if (billableEntries.length === 0) { toast.error("No billable entries to export."); return; }
    const doc = buildPDF();
    doc.save(`billing-${clientName.replace(/\s+/g, "-")}-${rangeStart}-to-${rangeEnd}.pdf`);
    toast.success("PDF exported.");
  };

  const handleSharePDF = async () => {
    if (billableEntries.length === 0) { toast.error("No billable entries to share."); return; }
    const doc = buildPDF();
    const blob = doc.output("blob");
    const file = new File([blob], `billing-${clientName.replace(/\s+/g, "-")}-${rangeStart}-to-${rangeEnd}.pdf`, { type: "application/pdf" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Billing - ${clientName}` });
      } catch (err: any) {
        if (err.name !== "AbortError") toast.error("Share failed.");
      }
    } else {
      // Fallback: just download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded (share not supported on this device).");
    }
  };

  const handleCopySummary = () => {
    const paymentLink = (profile as any)?.payment_link;
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>{clientName}</SheetTitle>
        </SheetHeader>

        <div className="px-6 pb-6 space-y-5">
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
          </div>

          {/* Actions — ordered: Export, Share, Copy */}
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
          </div>

          {billableEntries.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">No billable entries in this period.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PrepareBillingSheet;
