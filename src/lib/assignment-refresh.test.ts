import { describe, it, expect, beforeEach } from "vitest";
import { runAssignmentRefresh, resetAssignmentRefreshState } from "./assignment-refresh";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe("duplicate assignment triggers", () => {
  beforeEach(() => resetAssignmentRefreshState());

  it("runs the load only once when the recap is triggered several times at once", async () => {
    let runs = 0;
    const gate = deferred();
    const task = async () => {
      runs += 1;
      await gate.promise;
    };

    const a = runAssignmentRefresh("user-1", task, { hasCache: false });
    const b = runAssignmentRefresh("user-1", task, { hasCache: false });
    const c = runAssignmentRefresh("user-1", task, { hasCache: false });

    expect(runs).toBe(1);
    expect(b).toBe(a);
    expect(c).toBe(a);

    gate.resolve();
    await a;
    expect(runs).toBe(1);
  });

  it("skips a fresh reload when cached lists are already on screen", async () => {
    let runs = 0;
    await runAssignmentRefresh("user-2", async () => { runs += 1; }, { hasCache: false });
    const skipped = runAssignmentRefresh("user-2", async () => { runs += 1; }, { hasCache: true });
    expect(skipped).toBeUndefined();
    expect(runs).toBe(1);
  });

  it("still reloads when there is nothing cached to show", async () => {
    let runs = 0;
    await runAssignmentRefresh("user-3", async () => { runs += 1; }, { hasCache: false });
    await runAssignmentRefresh("user-3", async () => { runs += 1; }, { hasCache: false });
    expect(runs).toBe(2);
  });

  it("allows an immediate retry after a failed load", async () => {
    let runs = 0;
    await expect(
      runAssignmentRefresh("user-4", async () => { runs += 1; throw new Error("network"); }, { hasCache: true })
    ).rejects.toThrow("network");
    await runAssignmentRefresh("user-4", async () => { runs += 1; }, { hasCache: true });
    expect(runs).toBe(2);
  });
});
