import { describe, it, expect } from "vitest";
import { interpretReviewResult, canReview } from "./review-guard";

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

  it("only allows review while the report is still submitted", () => {
    expect(canReview("submitted")).toBe(true);
    expect(canReview("approved")).toBe(false);
    expect(canReview("rejected")).toBe(false);
    expect(canReview(null)).toBe(false);
  });
});
