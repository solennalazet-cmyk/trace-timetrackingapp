/**
 * Shared money rules for submitted reports (used by both sides).
 *
 * - A report is owed from the moment it is sent; rejected reports are excluded
 *   until they are re-sent.
 * - A payment is split across the oldest unpaid reports first (by period end,
 *   then by sent date, then id for a stable order).
 * - Paying more than what is owed is refused (one cent of rounding tolerated).
 */

export interface MoneyReport {
  id: string;
  status: string;
  total_amount: number | string;
  currency: string;
  period_end: string;
  submitted_at?: string | null;
}

export interface PaymentPart {
  reportId: string;
  amount: number;
  currency: string;
}

export type SplitResult =
  | { ok: true; parts: PaymentPart[]; amount: number }
  | { ok: false; message: string };

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const countsAsOwed = (r: Pick<MoneyReport, "status">) => r.status !== "rejected";

export function owedOn(r: MoneyReport, paidByReport: Map<string, number>): number {
  if (!countsAsOwed(r)) return 0;
  const total = Number(r.total_amount) || 0;
  return round2(Math.max(0, total - (paidByReport.get(r.id) ?? 0)));
}

export function totalOwed(reports: MoneyReport[], paidByReport: Map<string, number>): number {
  return round2(reports.reduce((s, r) => s + owedOn(r, paidByReport), 0));
}

export function splitPayment(
  raw: string | number,
  reports: MoneyReport[],
  paidByReport: Map<string, number>,
): SplitResult {
  const amount = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter a valid amount." };

  const owed = totalOwed(reports, paidByReport);
  if (owed <= 0) return { ok: false, message: "Nothing outstanding to pay." };
  if (amount > owed + CENT) return { ok: false, message: `That is more than the outstanding ${owed.toFixed(2)}.` };

  const ordered = reports
    .filter(countsAsOwed)
    .sort((a, b) =>
      a.period_end.localeCompare(b.period_end) ||
      (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "") ||
      a.id.localeCompare(b.id),
    );

  let remaining = round2(Math.min(amount, owed));
  const parts: PaymentPart[] = [];
  for (const r of ordered) {
    if (remaining <= 0) break;
    const left = owedOn(r, paidByReport);
    if (left <= 0) continue;
    const apply = round2(Math.min(left, remaining));
    parts.push({ reportId: r.id, amount: apply, currency: r.currency });
    remaining = round2(remaining - apply);
  }
  return { ok: true, parts, amount: round2(parts.reduce((s, p) => s + p.amount, 0)) };
}
