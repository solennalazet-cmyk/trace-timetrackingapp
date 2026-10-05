import { describe, it, expect } from "vitest";
import { interpretReviewResult, canReview, canReject } from "./review-guard";
import { owedOn } from "./payment-split";

describe("reviewing a report that may already have changed", () => {
  it("accepts a review that really changed the row", () => {
    expect(interpretReviewResult([{ id: "r1" }], null)).toEqual({ ok: true });
  });

  it("treats zero changed rows as already reviewed, not as success", () => {
    const out = interpretReviewResult([], null);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.kind).toBe("stale");
  });

  it("treats a null result the same way", () => {
    expect(interpretReviewResult(null, null).ok).toBe(false);
  });

  it("surfaces a real server error separately from a stale one", () => {
    const out = interpretReviewResult(null, { message: "network down" });
    expect(out.ok === false && out.kind).toBe("error");
    expect(out.ok === false && out.message).toBe("network down");
  });

  it("only allows approval while the report is still submitted", () => {
    expect(canReview("submitted")).toBe(true);
    expect(canReview("approved")).toBe(false);
    expect(canReview("rejected")).toBe(false);
    expect(canReview(null)).toBe(false);
  });

  it("allows rejecting a submitted or an approved report, never a rejected one", () => {
    expect(canReject("submitted")).toBe(true);
    expect(canReject("approved")).toBe(true);
    expect(canReject("rejected")).toBe(false);
    expect(canReject("pending_connection")).toBe(false);
    expect(canReject(null)).toBe(false);
  });

  it("a second reject tap (zero rows changed) reads as already reviewed", () => {
    expect(interpretReviewResult([], null)).toMatchObject({ ok: false, kind: "stale" });
  });
});

describe("rejected reports drop out of what is owed", () => {
  it("a rejected report owes nothing even with a payment recorded", () => {
    const paid = new Map([["r1", 50]]);
    expect(owedOn({ id: "r1", status: "rejected", total_amount: 200 } as any, paid)).toBe(0);
    expect(owedOn({ id: "r1", status: "approved", total_amount: 200 } as any, paid)).toBe(150);
  });
});
