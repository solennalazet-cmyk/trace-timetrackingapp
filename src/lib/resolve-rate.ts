import { supabase } from "@/integrations/supabase/client";

interface RateResult {
  amount: number | null;
  currency: string;
  source: "project" | "client" | "null";
}

/**
 * Resolves the billable rate using the safe priority cascade:
 * 1. Selected project explicit rate
 * 2. Selected client default rate
 * 3. No rate found — returns null amount
 */
export async function resolveRate(
  clientId: string | null,
  projectId: string | null,
  userId: string
): Promise<RateResult> {
  // 1. Selected project explicit rate
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("rate, currency")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (project?.rate != null) {
      return { amount: project.rate, currency: project.currency ?? "EUR", source: "project" };
    }
  }

  // 2. Selected client default rate
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("default_rate, currency")
      .eq("id", clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (client?.default_rate != null) {
      return { amount: client.default_rate, currency: client.currency ?? "EUR", source: "client" };
    }
  }

  // Older clients may not have a default_rate even though the same rate has
  // been used repeatedly. Reuse the newest matching hourly entry rather than
  // presenting an unexplained empty/zero field on first selection.
  if (clientId || projectId) {
    let recentRateQuery = supabase
      .from("time_entries")
      .select("rate_amount, rate_currency")
      .eq("user_id", userId)
      .eq("rate_unit", "hour")
      .not("rate_amount", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    recentRateQuery = projectId
      ? recentRateQuery.eq("project_id", projectId)
      : recentRateQuery.eq("client_id", clientId);

    const { data: recentEntries } = await recentRateQuery;
    const recent = recentEntries?.[0];
    if (recent?.rate_amount != null) {
      return {
        amount: recent.rate_amount,
        currency: recent.rate_currency ?? "EUR",
        source: clientId ? "client" : "project",
      };
    }
  }

  // 3. No rate found
  return { amount: null, currency: "EUR", source: "null" };
}
