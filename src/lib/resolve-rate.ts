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

  // 3. No rate found
  return { amount: null, currency: "EUR", source: "null" };
}
