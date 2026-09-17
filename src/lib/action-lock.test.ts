import { describe, it, expect, beforeEach } from "vitest";
import { runExclusive, isActionInFlight, resetActionLocks } from "./action-lock";

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("double-tap protection on server actions", () => {
  beforeEach(() => resetActionLocks());

  it("sends one request when the same action fires three times", async () => {
    const d = deferred<string>();
    let calls = 0;
    const task = () => { calls++; return d.promise; };

    const a = runExclusive("approve:r1", task);
    const b = runExclusive("approve:r1", task);
    const c = runExclusive("approve:r1", task);
    d.resolve("done");

    expect(await Promise.all([a, b, c])).toEqual(["done", "done", "done"]);
    expect(calls).toBe(1);
  });

  it("keeps different reports independent", async () => {
    let calls = 0;
    await Promise.all([
      runExclusive("approve:r1", async () => { calls++; }),
      runExclusive("approve:r2", async () => { calls++; }),
    ]);
    expect(calls).toBe(2);
  });

  it("allows a retry after the action finished", async () => {
    let calls = 0;
    await runExclusive("approve:r1", async () => { calls++; });
    await runExclusive("approve:r1", async () => { calls++; });
    expect(calls).toBe(2);
  });

  it("allows a retry after a failure and clears the lock", async () => {
    await expect(runExclusive("pay:r1", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(isActionInFlight("pay:r1")).toBe(false);
    await expect(runExclusive("pay:r1", async () => "ok")).resolves.toBe("ok");
  });
});
