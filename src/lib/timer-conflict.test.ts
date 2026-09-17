import { describe, it, expect } from "vitest";
import { localPauseIsAhead, isStaleServerResponse, type TimerLikeState } from "./timer-conflict";

const startedAt = "2026-09-17T08:18:00.000Z";

const base = (over: Partial<TimerLikeState> = {}): TimerLikeState => ({
  startedAt,
  pausedAt: null,
  totalPausedMs: 0,
  pauseIntervals: [],
  ...over,
});

describe("pause/resume vs a late server answer", () => {
  it("keeps the local pause when the server copy still says running", () => {
    const local = base({
      pausedAt: Date.parse("2026-09-17T08:58:00.000Z"),
      pauseIntervals: [{ paused_at: "2026-09-17T08:58:00.000Z", resumed_at: null }],
    });
    const staleRemote = base();
    expect(localPauseIsAhead(local, staleRemote)).toBe(true);
  });

  it("keeps the local copy when it counted more paused time", () => {
    expect(localPauseIsAhead(base({ totalPausedMs: 120_000 }), base({ totalPausedMs: 30_000 }))).toBe(true);
  });

  it("lets a newer server copy win when it knows more", () => {
    const local = base();
    const remote = base({
      totalPausedMs: 60_000,
      pauseIntervals: [{ paused_at: "2026-09-17T08:58:00.000Z", resumed_at: "2026-09-17T08:59:00.000Z" }],
    });
    expect(localPauseIsAhead(local, remote)).toBe(false);
  });

  it("never mixes up two different sessions", () => {
    const local = base({ pausedAt: 1, pauseIntervals: [{ paused_at: "x", resumed_at: null }] });
    const otherSession = base({ startedAt: "2026-09-17T12:00:00.000Z" });
    expect(localPauseIsAhead(local, otherSession)).toBe(false);
  });

  it("flags a server answer that arrived after the user acted", () => {
    const mutationAtRequestStart = 4;
    expect(isStaleServerResponse(mutationAtRequestStart, 4)).toBe(false);
    // user pressed Resume while the request was in flight
    expect(isStaleServerResponse(mutationAtRequestStart, 5)).toBe(true);
  });
});
