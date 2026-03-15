/**
 * Billing rate resolution — follows the cascade:
 * 1. Session-level rate (always wins)
 * 2. Project rate (if project assigned)
 * 3. Client default rate (fallback)
 */
export function resolveRate(
  sessionRate: number | null | undefined,
  project: { rate?: number | null; currency?: string | null } | null,
  client: { default_rate?: number | null; currency?: string | null } | null
): { amount: number; currency: string } {
  if (sessionRate != null && sessionRate > 0) {
    return {
      amount: sessionRate,
      currency: project?.currency ?? client?.currency ?? "EUR",
    };
  }

  if (project?.rate) {
    return {
      amount: project.rate,
      currency: project.currency ?? client?.currency ?? "EUR",
    };
  }

  if (client?.default_rate) {
    return {
      amount: client.default_rate,
      currency: client.currency ?? "EUR",
    };
  }

  return { amount: 0, currency: client?.currency ?? "EUR" };
}
