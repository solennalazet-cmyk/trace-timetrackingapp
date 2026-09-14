import type jsPDF from "jspdf";

export interface PdfTableOptions {
  startY: number;
  head: string[];
  body: string[][];
  margin: number;
  fontSize?: number;
  /** Optional per-cell style hook (row index, column index) */
  cellStyle?: (rowIndex: number, colIndex: number, text: string) =>
    | { fill?: [number, number, number]; text?: [number, number, number]; bold?: boolean }
    | undefined;
}

/**
 * Draws a real, explicitly positioned table (borders + fills + per-cell text).
 *
 * Used as the single source of truth for report tables: autoTable output is
 * text-only in some readers (which then reflow it into a paragraph), so every
 * cell here is drawn with its own rectangle and its own text position.
 */
export function drawPdfTable(doc: jsPDF, opts: PdfTableOptions) {
  const { startY, head, body, margin } = opts;
  const fontSize = opts.fontSize ?? 8;
  const padX = 1.8;
  const padY = 2.2;
  const lineH = fontSize * 0.42; // mm per text line at this font size
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = pageW - margin * 2;

  // ── Column widths: proportional to the widest content, min/max clamped ──
  doc.setFontSize(fontSize);
  const cols = head.length;
  const natural = head.map((h, c) => {
    doc.setFont("helvetica", "bold");
    let w = doc.getTextWidth(h);
    doc.setFont("helvetica", "normal");
    for (const row of body) {
      const t = row[c] ?? "";
      const tw = doc.getTextWidth(t);
      if (tw > w) w = tw;
    }
    return w + padX * 2 + 1;
  });
  const naturalTotal = natural.reduce((a, b) => a + b, 0);
  let widths: number[];
  if (naturalTotal <= tableW) {
    const extra = (tableW - naturalTotal) / cols;
    widths = natural.map((w) => w + extra);
  } else {
    const scale = tableW / naturalTotal;
    widths = natural.map((w) => Math.max(12, w * scale));
    // Re-normalise after the min clamp so the table still fits exactly.
    const t = widths.reduce((a, b) => a + b, 0);
    widths = widths.map((w) => (w * tableW) / t);
  }
  const xs: number[] = [];
  let acc = margin;
  for (const w of widths) { xs.push(acc); acc += w; }

  const wrap = (text: string, width: number) =>
    doc.splitTextToSize(text || "", Math.max(4, width - padX * 2)) as string[];

  const drawRow = (
    cells: string[],
    y: number,
    isHead: boolean,
    rowIndex: number,
    zebra: boolean,
  ) => {
    const lines = cells.map((t, c) => wrap(t ?? "", widths[c]));
    const rowH = Math.max(...lines.map((l) => l.length)) * lineH + padY * 2;

    cells.forEach((text, c) => {
      const style = isHead ? undefined : opts.cellStyle?.(rowIndex, c, text ?? "");
      const fill = style?.fill ?? (isHead ? [245, 245, 245] : zebra ? [252, 252, 252] : null);
      if (fill) {
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.rect(xs[c], y, widths[c], rowH, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.rect(xs[c], y, widths[c], rowH, "S");

      const tc = style?.text ?? (isHead ? [60, 60, 60] : [50, 50, 50]);
      doc.setTextColor(tc[0], tc[1], tc[2]);
      doc.setFont("helvetica", isHead || style?.bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      lines[c].forEach((ln, i) => {
        doc.text(ln, xs[c] + padX, y + padY + lineH * (i + 0.8));
      });
    });
    return rowH;
  };

  let y = startY;
  const bottom = pageH - 16;
  y += drawRow(head, y, true, -1, false);

  body.forEach((row, i) => {
    const lines = row.map((t, c) => wrap(t ?? "", widths[c]));
    const rowH = Math.max(...lines.map((l) => l.length)) * lineH + padY * 2;
    if (y + rowH > bottom) {
      doc.addPage();
      y = 16;
      y += drawRow(head, y, true, -1, false);
    }
    y += drawRow(row, y, false, i, i % 2 === 1);
  });

  return y;
}
