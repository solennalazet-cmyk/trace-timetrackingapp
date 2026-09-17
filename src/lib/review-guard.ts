/**
 * Guards for reviewing a submitted report (approve / reject).
 *
 * Same family of problem as the timer pause/resume bug: two actions can race.
 * An employer can tap Approve twice, swipe and then open the sheet, or review a
 * report that a co-worker (or the freelancer, by resubmitting) already changed
 * on the server. A blind `update ... where id = ?` would silently overwrite the
 * newer state.
 *
 * The fix: every review write is conditional on the row still being in the
 * expected status, and the caller interprets "zero rows changed" as
 * "someone got there first" instead of as success.
 */

export const REVIEWABLE_STATUS = "submitted";

export type ReviewOutcome =
  | { ok: true }
  | { ok: false; kind: "error"; message: string }
  | { ok: false; kind: "stale"; message: string };

/**
 * Interpret the result of a conditional review update.
 * `rows` is what Supabase returned from `.update(...).eq("status","submitted").select("id")`.
 */
export function interpretReviewResult(
  rows: { id: string }[] | null | undefined,
  error: { message: string } | null | undefined,
): ReviewOutcome {
  if (error) return { ok: false, kind: "error", message: error.message };
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      kind: "stale",
      message: "This report was already reviewed. Refreshing the list.",
    };
  }
  return { ok: true };
}

/** True when a report can still be approved or rejected. */
export function canReview(status: string | null | undefined): boolean {
  return status === REVIEWABLE_STATUS;
}
