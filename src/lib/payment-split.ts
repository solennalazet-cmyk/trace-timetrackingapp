/**
 * Shared money rules for submitted reports (used by both sides).
 *
 * - A report is owed from the moment it is sent; rejected reports are excluded
 *   until they are re-sent.
 * - A payment is split across the oldest unpaid reports first (by period end,
 *   then by sent date, then id for a stable order).
 * - By default paying more than what is owed is refused (one cent of rounding
 *   tolerated). `allowOver` lets the extra land on the last report reached.
 * - A report marked "fully settled" by its recorder owes nothing more.
 */

export interface MoneyReport {
  id: string;
  status: string;
  total_amount: number | string;
  currency: string;
  period_end: string;
  submitted_at?: string | null;
  worker_user_id?: string;
}

export interface MoneyPayment {
  submitted_report_id: string;
  amount: number | string;
  recorded_by_user_id: string;
  legacy_shared?: boolean | null;
  fully_settled?: boolean | null;
}

export interface PaymentPart {
  reportId: string;
  amount: number;
  currency: string;
}

export interface SplitOptions {
  /** Allow recording more than is owed; the extra goes on the last report reached. */
  allowOver?: boolean;
}

export type SplitResult =
  | { ok: true; parts: PaymentPart[]; amount: number; owedReached: number; shortfall: number; over: number }
  | { ok: false; message: string };

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const parseAmount = (raw: string | number) =>
  typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));

export const countsAsOwed = (r: Pick<MoneyReport, "status">) => r.status !== "rejected";

export function owedOn(r: MoneyReport, paidByReport: Map<string, number>, settled?: Set<string>): number {
  if (!countsAsOwed(r)) return 0;
  if (settled?.has(r.id)) return 0;
  const total = Number(r.total_amount) || 0;
  return round2(Math.max(0, total - (paidByReport.get(r.id) ?? 0)));
}

export function totalOwed(reports: MoneyReport[], paidByReport: Map<string, number>, settled?: Set<string>): number {
  return round2(reports.reduce((s, r) => s + owedOn(r, paidByReport, settled), 0));
}

/**
 * Payments that count for a report. When the report's freelancer has recorded
 * a new (non-legacy) receipt on it, only the freelancer's own rows count, so a
 * legacy row from the other party is not added on top. Viewers who cannot see
 * those receipts are unaffected.
 */
export function countedPayments<P extends MoneyPayment>(payments: P[], reports: Pick<MoneyReport, "id" | "worker_user_id">[]): P[] {
  const workerOf = new Map(reports.map((r) => [r.id, r.worker_user_id]));
  const ownReceipt = new Set<string>();
  for (const p of payments) {
    const w = workerOf.get(p.submitted_report_id);
    if (w && !p.legacy_shared && p.recorded_by_user_id === w) ownReceipt.add(p.submitted_report_id);
  }
  return payments.filter((p) =>
    !ownReceipt.has(p.submitted_report_id) || p.recorded_by_user_id === workerOf.get(p.submitted_report_id),
  );
}

export function paidMap(payments: MoneyPayment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) m.set(p.submitted_report_id, round2((m.get(p.submitted_report_id) ?? 0) + Number(p.amount)));
  return m;
}

export function settledSet(payments: MoneyPayment[]): Set<string> {
  return new Set(payments.filter((p) => p.fully_settled).map((p) => p.submitted_report_id));
}

export function splitPayment(
  raw: string | number,
  reports: MoneyReport[],
  paidByReport: Map<string, number>,
  options: SplitOptions & { settled?: Set<string> } = {},
): SplitResult {
  const amount = round2(parseAmount(raw));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter a valid amount." };

  const owed = totalOwed(reports, paidByReport, options.settled);
  if (owed <= 0) return { ok: false, message: "Nothing outstanding to pay." };
  if (!options.allowOver && amount > owed + CENT) {
    return { ok: false, message: `That is more than the ${owed.toFixed(2)} owed.` };
  }

  const ordered = reports
    .filter(countsAsOwed)
    .sort((a, b) =>
      a.period_end.localeCompare(b.period_end) ||
      (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "") ||
      a.id.localeCompare(b.id),
    );

  let remaining = round2(Math.min(amount, owed));
  const parts: PaymentPart[] = [];
  let owedReached = 0;
  for (const r of ordered) {
    if (remaining <= 0) break;
    const left = owedOn(r, paidByReport, options.settled);
    if (left <= 0) continue;
    const apply = round2(Math.min(left, remaining));
    parts.push({ reportId: r.id, amount: apply, currency: r.currency });
    owedReached = round2(owedReached + left);
    remaining = round2(remaining - apply);
  }
  const over = options.allowOver ? round2(Math.max(0, amount - owed)) : 0;
  if (over > 0 && parts.length > 0) parts[parts.length - 1].amount = round2(parts[parts.length - 1].amount + over);
  const total = round2(parts.reduce((s, p) => s + p.amount, 0));
  return { ok: true, parts, amount: total, owedReached, shortfall: round2(Math.max(0, owedReached - total)), over };
}

/** Shortfall is "large" when it is more than 10% of the amount the receipt covers. */
export const isLargeShortfall = (shortfall: number, owedReached: number) =>
  owedReached > 0 && shortfall > owedReached * 0.1;
