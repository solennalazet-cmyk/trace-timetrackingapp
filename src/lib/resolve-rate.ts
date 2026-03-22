import { supabase } from "@/integrations/supabase/client";

interface RateResult {
  amount: number | null;
  currency: string;
}

/**
 * Resolves the billable rate using the priority cascade:
 * 1. Project rate (from projects table)
 * 2. Most recent entry rate for this project
 * 3. Client default rate (from clients table)
 * 4. Most recent entry rate for this client
 * 5. No rate found — returns null amount
 */
export async function resolveRate(
  clientId: string | null,
  projectId: string | null,
  userId: string
): Promise<RateResult> {
  // 1. Project rate
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("rate, currency")
      .eq("id", projectId)
      .single();
    if (project?.rate) {
      return { amount: project.rate, currency: project.currency ?? "EUR" };
    }
  }

  // 2. Most recent entry rate for this project
  if (projectId) {
    const { data: last } = await supabase
      .from("time_entries")
      .select("rate_amount, rate_currency")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .not("rate_amount", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.rate_amount) {
      return { amount: last.rate_amount, currency: last.rate_currency ?? "EUR" };
    }
  }

  // 3. Client default rate
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("default_rate, currency")
      .eq("id", clientId)
      .single();
    if (client?.default_rate) {
      return { amount: client.default_rate, currency: client.currency ?? "EUR" };
    }
  }

  // 4. Most recent entry rate for this client
  if (clientId) {
    const { data: last } = await supabase
      .from("time_entries")
      .select("rate_amount, rate_currency")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .not("rate_amount", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.rate_amount) {
      return { amount: last.rate_amount, currency: last.rate_currency ?? "EUR" };
    }
  }

  // 5. No rate found
  return { amount: null, currency: "EUR" };
}
