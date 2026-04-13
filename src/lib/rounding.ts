/**
 * Apply rounding rules to duration (minutes) and billable amounts.
 * Settings come from user_settings table.
 *
 * round_scope controls WHERE rounding is applied:
 *   "session" → round each entry individually, then sum
 *   "total"   → sum raw values, then round the total
 */

export interface RoundingSettings {
  round_duration: string;   // "none" | "up" | "down" | "nearest"
  round_duration_to: number; // e.g. 15 (minutes)
  round_amount: string;     // "none" | "up" | "down" | "nearest"
  round_amount_to: number;  // e.g. 0.01
  round_scope: string;      // "session" | "total"
}

export const DEFAULT_ROUNDING: RoundingSettings = {
  round_duration: "none",
  round_duration_to: 15,
  round_amount: "none",
  round_amount_to: 0.01,
  round_scope: "session",
};

function applyRound(value: number, mode: string, step: number): number {
  if (mode === "none" || step <= 0) return value;
  switch (mode) {
    case "up":
      return Math.ceil(value / step) * step;
    case "down":
      return Math.floor(value / step) * step;
    case "nearest":
      return Math.round(value / step) * step;
    default:
      return value;
  }
}

export function roundDuration(minutes: number, settings: RoundingSettings): number {
  return applyRound(minutes, settings.round_duration, settings.round_duration_to);
}

export function roundAmount(amount: number, settings: RoundingSettings): number {
  return applyRound(amount, settings.round_amount, settings.round_amount_to);
}

/**
 * Recalculate billable_value from rounded duration and rate.
 */
export function roundedBillableValue(
  durationMinutes: number,
  rateAmount: number | null,
  rateUnit: string | null,
  billable: boolean | null,
  settings: RoundingSettings
): number {
  if (!billable || !rateAmount) return 0;
  const mins = roundDuration(durationMinutes, settings);
  let value: number;
  if (rateUnit === "project") {
    value = rateAmount;
  } else {
    // per hour (default) or per word — for per-hour, convert minutes to hours
    value = (mins / 60) * rateAmount;
  }
  return roundAmount(value, settings);
}

/** Raw billable value without any rounding applied */
export function rawBillableValue(
  durationMinutes: number,
  rateAmount: number | null,
  rateUnit: string | null,
  billable: boolean | null,
): number {
  if (!billable || !rateAmount) return 0;
  if (rateUnit === "project") return rateAmount;
  return (durationMinutes / 60) * rateAmount;
}

/**
 * Check if any rounding rule is active.
 */
export function hasActiveRounding(settings: RoundingSettings): boolean {
  return settings.round_duration !== "none" || settings.round_amount !== "none";
}

/**
 * Describe active rounding rules as human-readable text.
 */
export function describeRounding(settings: RoundingSettings): string {
  const parts: string[] = [];
  if (settings.round_duration !== "none") {
    parts.push(`durations rounded ${settings.round_duration} to ${settings.round_duration_to} min`);
  }
  if (settings.round_amount !== "none") {
    parts.push(`amounts rounded ${settings.round_amount === "nearest" ? "to the nearest" : settings.round_amount} ${settings.round_amount_to < 1 ? settings.round_amount_to.toString() : "€" + settings.round_amount_to}`);
  }
  if (parts.length > 0) {
    parts.push(settings.round_scope === "total" ? "applied to totals" : "applied per session");
  }
  return parts.join(", ");
}

/**
 * Entry-like shape for scope-aware aggregation
 */
interface RoundableEntry {
  duration_minutes: number;
  rate_amount?: number | null;
  rate_unit?: string | null;
  billable?: boolean | null;
}

/**
 * Scope-aware aggregation: compute total duration (minutes) and total billable value
 * respecting round_scope setting.
 *
 * "session" → round each entry, then sum
 * "total"   → sum raw, then round the total
 */
export function aggregateWithRounding<T extends RoundableEntry>(
  entries: T[],
  settings: RoundingSettings,
): { totalMinutes: number; totalValue: number } {
  if (settings.round_scope === "total") {
    // Sum raw, then round once
    const rawMins = entries.reduce((s, e) => s + e.duration_minutes, 0);
    const rawVal = entries.reduce((s, e) => s + rawBillableValue(e.duration_minutes, e.rate_amount ?? null, e.rate_unit ?? null, e.billable ?? false), 0);
    return {
      totalMinutes: roundDuration(rawMins, settings),
      totalValue: roundAmount(rawVal, settings),
    };
  }
  // Per-session: round each, then sum
  return {
    totalMinutes: entries.reduce((s, e) => s + roundDuration(e.duration_minutes, settings), 0),
    totalValue: entries.reduce((s, e) => s + roundedBillableValue(e.duration_minutes, e.rate_amount ?? null, e.rate_unit ?? null, e.billable ?? false, settings), 0),
  };
}

/**
 * For a single entry, return the display duration/value based on scope.
 * In "total" scope, individual entries show raw values (rounding only at aggregate level).
 * In "session" scope, individual entries show rounded values.
 */
export function entryDisplayValues(
  entry: RoundableEntry,
  settings: RoundingSettings,
): { displayMinutes: number; displayValue: number } {
  if (settings.round_scope === "total") {
    return {
      displayMinutes: entry.duration_minutes,
      displayValue: rawBillableValue(entry.duration_minutes, entry.rate_amount ?? null, entry.rate_unit ?? null, entry.billable ?? false),
    };
  }
  return {
    displayMinutes: roundDuration(entry.duration_minutes, settings),
    displayValue: roundedBillableValue(entry.duration_minutes, entry.rate_amount ?? null, entry.rate_unit ?? null, entry.billable ?? false, settings),
  };
}
