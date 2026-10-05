import { describe, it, expect } from "vitest";
import { splitPayment, totalOwed, type MoneyReport } from "./payment-split";

const rep = (id: string, total: number, period_end: string, status = "submitted"): MoneyReport => ({
  id, status, total_amount: total, currency: "EUR", period_end,
});

describe("splitting a payment across reports", () => {
  const reports = [rep("sep", 200, "2026-09-30"), rep("aug", 100, "2026-08-31")];

  it("pays the exact amount owed on one report", () => {
    const r = splitPayment("100", [rep("a", 100, "2026-09-30")], new Map());
    expect(r).toMatchObject({ ok: true, amount: 100, parts: [{ reportId: "a", amount: 100, currency: "EUR" }] });
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

import { countedPayments, paidMap, settledSet, isLargeShortfall, parseAmount } from "./payment-split";

describe("side-specific payment rules", () => {
  const reports = [rep("aug", 100, "2026-08-31"), rep("sep", 200, "2026-09-30")];

  it("employer overpaying is refused with the amount owed in the message", () => {
    const r = splitPayment("300,50", reports, new Map());
    expect(r).toEqual({ ok: false, message: "That is more than the 300.00 owed." });
  });

  it("accepts comma decimals", () => {
    expect(parseAmount("12,34")).toBe(12.34);
    const r = splitPayment("50,5", reports, new Map());
    expect(r.ok && r.parts).toEqual([{ reportId: "aug", amount: 50.5, currency: "EUR" }]);
  });

  it("freelancer may record more than invoiced; extra goes on the last report reached", () => {
    const r = splitPayment("320", reports, new Map(), { allowOver: true });
    expect(r.ok && r.parts).toEqual([
      { reportId: "aug", amount: 100, currency: "EUR" },
      { reportId: "sep", amount: 220, currency: "EUR" },
    ]);
    expect(r.ok && r.over).toBe(20);
  });

  it("freelancer may record less (fees); settled tick spans two reports with the shortfall", () => {
    const r = splitPayment("280", reports, new Map(), { allowOver: true });
    expect(r.ok && r.parts.map((p) => p.reportId)).toEqual(["aug", "sep"]);
    expect(r.ok && r.shortfall).toBe(20);
    expect(r.ok && r.owedReached).toBe(300);
    // After saving with fully_settled on both rows, nothing is owed on either.
    const pays = [
      { submitted_report_id: "aug", amount: 100, recorded_by_user_id: "w", fully_settled: true },
      { submitted_report_id: "sep", amount: 180, recorded_by_user_id: "w", fully_settled: true },
    ];
    expect(totalOwed(reports, paidMap(pays), settledSet(pays))).toBe(0);
  });

  it("flags a large shortfall only above 10% of the amount covered", () => {
    expect(isLargeShortfall(30, 300)).toBe(false);
    expect(isLargeShortfall(30.01, 300)).toBe(true);
  });

  it("a legacy employer payment plus a new freelancer receipt on one report is not double counted", () => {
    const rs = [{ id: "r1", worker_user_id: "w" }, { id: "r2", worker_user_id: "w" }];
    const pays = [
      { submitted_report_id: "r1", amount: 100, recorded_by_user_id: "e", legacy_shared: true },
      { submitted_report_id: "r1", amount: 97, recorded_by_user_id: "w", legacy_shared: false },
      { submitted_report_id: "r2", amount: 50, recorded_by_user_id: "e", legacy_shared: true },
    ];
    const m = paidMap(countedPayments(pays, rs));
    expect(m.get("r1")).toBe(97);
    expect(m.get("r2")).toBe(50); // no new receipt: legacy row still counts
  });
});
