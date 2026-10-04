import { describe, it, expect } from "vitest";
import { splitPayment, totalOwed, type MoneyReport } from "./payment-split";

const rep = (id: string, total: number, period_end: string, status = "submitted"): MoneyReport => ({
  id, status, total_amount: total, currency: "EUR", period_end,
});

describe("splitting a payment across reports", () => {
  const reports = [rep("sep", 200, "2026-09-30"), rep("aug", 100, "2026-08-31")];

  it("pays the exact amount owed on one report", () => {
    const r = splitPayment("100", [rep("a", 100, "2026-09-30")], new Map());
    expect(r).toEqual({ ok: true, amount: 100, parts: [{ reportId: "a", amount: 100, currency: "EUR" }] });
  });

  it("puts a partial payment on the oldest report first", () => {
    const r = splitPayment("60", reports, new Map());
    expect(r.ok && r.parts).toEqual([{ reportId: "aug", amount: 60, currency: "EUR" }]);
  });

  it("refuses paying more than is owed", () => {
    expect(splitPayment("301", reports, new Map()).ok).toBe(false);
  });

  it("spans several reports, oldest first, counting earlier payments", () => {
    const r = splitPayment("150", reports, new Map([["aug", 40]]));
    expect(r.ok && r.parts).toEqual([
      { reportId: "aug", amount: 60, currency: "EUR" },
      { reportId: "sep", amount: 90, currency: "EUR" },
    ]);
  });

  it("never puts money on a rejected report", () => {
    const withRejected = [rep("old-rejected", 500, "2026-07-31", "rejected"), ...reports];
    expect(totalOwed(withRejected, new Map())).toBe(300);
    const r = splitPayment("300", withRejected, new Map());
    expect(r.ok && r.parts.map((p) => p.reportId)).toEqual(["aug", "sep"]);
  });
});
