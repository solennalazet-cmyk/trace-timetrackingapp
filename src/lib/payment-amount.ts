/**
 * Validation for recording a payment against a submitted report.
 *
 * Missing/odd values used to reach the database: an empty field became NaN, and
 * nothing stopped an amount larger than what was still outstanding (which then
 * showed a negative balance elsewhere). Rounding noise on the outstanding total
 * is tolerated by a one-cent margin.
 */

export interface PaymentCheck {
  ok: boolean;
  amount?: number;
  message?: string;
}

const CENT = 0.01;

export function validatePaymentAmount(raw: string | number, outstanding: number): PaymentCheck {
  const amount = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Enter a valid amount." };
  }
  const max = Number.isFinite(outstanding) ? outstanding : 0;
  if (max <= 0) {
    return { ok: false, message: "This report is already fully paid." };
  }
  if (amount > max + CENT) {
    return { ok: false, message: `That is more than the outstanding ${max.toFixed(2)}.` };
  }
  return { ok: true, amount: Math.round(amount * 100) / 100 };
}

/** Stable key so the same payment cannot be inserted twice by a double tap. */
export function paymentLockKey(reportId: string, amount: number, date: string): string {
  return `payment:${reportId}:${amount.toFixed(2)}:${date}`;
}
