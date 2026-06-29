export function sanitizeDecimalInput(value: string): string {
  return value.replace(/[^0-9.,]/g, "");
}

export function normalizeDecimalInput(value: string | number | null | undefined): string {
  const raw = (value ?? "").toString().trim().replace(/\s/g, "");
  if (!raw) return "";

  const cleaned = sanitizeDecimalInput(raw);
  if (!cleaned) return "";

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const decimalIndex = Math.max(lastDot, lastComma);

  if (decimalIndex < 0) return cleaned;

  const whole = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
  const fraction = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, "");

  return `${whole || "0"}.${fraction}`;
}

export function parseDecimalInput(value: string | number | null | undefined): number | null {
  const normalized = normalizeDecimalInput(value);
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePositiveDecimalInput(value: string | number | null | undefined): number | null {
  const parsed = parseDecimalInput(value);
  return parsed != null && parsed > 0 ? parsed : null;
}