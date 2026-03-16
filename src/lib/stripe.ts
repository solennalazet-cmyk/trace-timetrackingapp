import { supabase } from "@/integrations/supabase/client";

export async function redirectToCheckout() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  if (data?.url) {
    window.location.href = data.url;
  } else {
    throw new Error("No checkout URL returned");
  }
}

export async function redirectToPortal() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("create-portal-session", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  if (data?.url) {
    window.location.href = data.url;
  } else {
    throw new Error("No portal URL returned");
  }
}
