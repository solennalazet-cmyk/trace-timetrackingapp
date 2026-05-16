import { supabase } from "@/integrations/supabase/client";

interface RateResult {
  amount: number | null;
  currency: string;
  source: "project" | "client" | "project-history" | "client-history" | "null";
}

/**
 * Resolves the billable rate using the priority cascade:
 * 1. Selected project explicit rate
 * 2. Most recent prior entry for that project
 * 3. Selected client default rate
 * 4. Most recent prior entry for that client
 * 5. No rate found — returns null amount
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

    // 2. Most recent prior entry for that project
    const { data: lastProjectEntry } = await supabase
      .from("time_entries")
      .select("rate_amount, rate_currency")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("rate_amount", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastProjectEntry?.rate_amount != null) {
      return {
        amount: lastProjectEntry.rate_amount,
        currency: lastProjectEntry.rate_currency ?? "EUR",
        source: "project-history",
      };
    }
  }

  // 3. Selected client default rate
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

    // 4. Most recent prior entry for that client
    const { data: lastClientEntry } = await supabase
      .from("time_entries")
      .select("rate_amount, rate_currency")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("rate_amount", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastClientEntry?.rate_amount != null) {
      return {
        amount: lastClientEntry.rate_amount,
        currency: lastClientEntry.rate_currency ?? "EUR",
        source: "client-history",
      };
    }
  }

  // 5. No rate found
  return { amount: null, currency: "EUR", source: "null" };
}
