import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useAutoResolvedRate } from "./useAutoResolvedRate";

const resolveRateMock = vi.fn();
vi.mock("@/lib/resolve-rate", () => ({
  resolveRate: (...args: unknown[]) => resolveRateMock(...args),
}));

const client = (over: Partial<{ id: string; default_rate: number | null; currency: string | null }> = {}) => ({
  id: "client-1",
  default_rate: null as number | null,
  currency: "EUR" as string | null,
  ...over,
});

describe("rate on opening the assignment box", () => {
  beforeEach(() => resolveRateMock.mockReset());

  it("fills the rate from the client already loaded, without any request", () => {
    const onResolved = vi.fn();
    renderHook(() =>
      useAutoResolvedRate({
        enabled: true,
        clientId: "client-1",
        projectId: "",
        userId: "user-1",
        clients: [client({ default_rate: 10 })],
        projects: [],
        onReset: vi.fn(),
        onResolved,
      })
    );
    expect(onResolved).toHaveBeenCalledWith({ amount: "10", currency: "EUR" });
    expect(resolveRateMock).not.toHaveBeenCalled();
  });

  it("falls back to the saved rate when the client carries none", async () => {
    const onResolved = vi.fn();
    resolveRateMock.mockResolvedValue({ amount: 12.5, currency: "EUR", source: "client" });
    renderHook(() =>
      useAutoResolvedRate({
        enabled: true,
        clientId: "client-1",
        projectId: "",
        userId: "user-1",
        clients: [client()],
        projects: [],
        onReset: vi.fn(),
        onResolved,
      })
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ amount: "12.5", currency: "EUR" }));
  });

  it("ignores a late answer for a client the user already moved away from", async () => {
    const onResolved = vi.fn();
    let resolveFirst!: (value: unknown) => void;
    resolveRateMock
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ amount: 20, currency: "EUR", source: "client" });

    const { rerender } = renderHook(
      ({ clientId }: { clientId: string }) =>
        useAutoResolvedRate({
          enabled: true,
          clientId,
          projectId: "",
          userId: "user-1",
          clients: [client(), client({ id: "client-2" })],
          projects: [],
          onReset: vi.fn(),
          onResolved,
        }),
      { initialProps: { clientId: "client-1" } }
    );

    rerender({ clientId: "client-2" });
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ amount: "20", currency: "EUR" }));

    resolveFirst({ amount: 99, currency: "EUR", source: "client" });
    await new Promise((r) => setTimeout(r, 0));
    expect(onResolved).not.toHaveBeenCalledWith({ amount: "99", currency: "EUR" });
  });

  it("does not wipe the field when the lists refresh in the background", () => {
    const onReset = vi.fn();
    const onResolved = vi.fn();
    const props = {
      enabled: true,
      clientId: "client-1",
      projectId: "",
      userId: "user-1",
      projects: [],
      onReset,
      onResolved,
    };
    const { rerender } = renderHook(
      ({ clients }: { clients: ReturnType<typeof client>[] }) =>
        useAutoResolvedRate({ ...props, clients }),
      { initialProps: { clients: [client({ default_rate: 10 })] } }
    );
    onReset.mockClear();
    // same selection, freshly fetched array identity
    rerender({ clients: [client({ default_rate: 10 })] });
    expect(onReset).not.toHaveBeenCalled();
  });
});
