type KeyPart = string | number | boolean | null | undefined;

const normalizePart = (part: KeyPart) => {
  const value = String(part ?? "none").trim() || "none";
  return encodeURIComponent(value).slice(0, 120);
};

export function makeTimeEntryIdempotencyKey(...parts: KeyPart[]) {
  return ["trace-entry", ...parts].map(normalizePart).join(":").slice(0, 512);
}

export function makeSessionEntryKey(
  ownerId: string,
  session: { entryType?: string | null; startedAt?: string | null; durationMinutes?: number; breakMinutes?: number | null; idempotencyKey?: string },
  segment: KeyPart = "single"
) {
  const base = session.idempotencyKey || makeTimeEntryIdempotencyKey(
    "session",
    ownerId,
    session.entryType ?? "timer",
    session.startedAt ?? "no-start",
    session.durationMinutes ?? 0,
    session.breakMinutes ?? 0
  );

  return segment === "single" ? base : makeTimeEntryIdempotencyKey(base, segment);
}