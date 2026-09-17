import { describe, it, expect } from "vitest";
import { validatePaymentAmount, paymentLockKey } from "./payment-amount";

describe("recording a payment amount", () => {
  it("accepts a normal partial payment", () => {
    expect(validatePaymentAmount("120.50", 704)).toEqual({ ok: true, amount: 120.5 });
  });

  it("accepts a comma decimal separator", () => {
    expect(validatePaymentAmount("120,50", 704)).toEqual({ ok: true, amount: 120.5 });
  });

  it("refuses empty, zero and negative amounts", () => {
    for (const v of ["", "abc", "0", "-5"]) {
      expect(validatePaymentAmount(v, 100).ok).toBe(false);
    }
  });

  it("refuses paying more than what is outstanding", () => {
    expect(validatePaymentAmount("150", 100).ok).toBe(false);
  });

  it("tolerates one cent of rounding on the outstanding total", () => {
    expect(validatePaymentAmount("100.01", 100).ok).toBe(true);
  });

  it("refuses a payment on a fully paid report", () => {
    expect(validatePaymentAmount("10", 0).ok).toBe(false);
  });

  it("builds the same key for a duplicated tap", () => {
    expect(paymentLockKey("r1", 120.5, "2026-09-17")).toBe(paymentLockKey("r1", 120.5, "2026-09-17"));
    expect(paymentLockKey("r1", 120.5, "2026-09-17")).not.toBe(paymentLockKey("r1", 120.6, "2026-09-17"));
  });
});
