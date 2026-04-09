/**
 * Apply rounding rules to duration (minutes) and billable amounts.
 * Settings come from user_settings table.
 */

export interface RoundingSettings {
  round_duration: string;   // "none" | "up" | "down" | "nearest"
  round_duration_to: number; // e.g. 15 (minutes)
  round_amount: string;     // "none" | "up" | "down" | "nearest"
  round_amount_to: number;  // e.g. 0.01
}

export const DEFAULT_ROUNDING: RoundingSettings = {
  round_duration: "none",
  round_duration_to: 15,
  round_amount: "none",
  round_amount_to: 0.01,
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
