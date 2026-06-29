/**
 * Export Settings — column selection for client billing/exports.
 * Stored on `clients.export_columns` (text[]). When null, defaults are used.
 *
 * Always-on columns (not user-controllable): Date, Duration, Amount.
 */
export type ExportColumnKey =
  | "clock_in"
  | "pause_start"
  | "pause_resume"
  | "pause_total"
  | "clock_out"
  | "location"
  | "project"
  | "task"
  | "notes";

export const EXPORT_COLUMN_OPTIONS: { key: ExportColumnKey; label: string }[] = [
  { key: "clock_in", label: "Clock in time" },
  { key: "clock_out", label: "Clock out time" },
  { key: "pause_start", label: "Clock in pause on" },
  { key: "pause_resume", label: "Clock in pause off" },
  { key: "pause_total", label: "Pause total duration" },
  { key: "location", label: "Location proof" },
  { key: "project", label: "Project name" },
  { key: "task", label: "Task name" },
  { key: "notes", label: "Notes" },
];

/** Sensible defaults the first time a client is billed. */
export const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = ["clock_in", "clock_out", "pause_start", "pause_resume"];

export const resolveExportColumns = (
  stored: string[] | null | undefined
): ExportColumnKey[] => {
  if (stored == null) return [...DEFAULT_EXPORT_COLUMNS];
  const valid = new Set(EXPORT_COLUMN_OPTIONS.map((o) => o.key));
  return stored.filter((k): k is ExportColumnKey => valid.has(k as ExportColumnKey));
};
