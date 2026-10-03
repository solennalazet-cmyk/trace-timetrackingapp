import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Rejections reviewed before this moment never raise alerts (feature launch). */
export const REJECT_ALERT_CUTOFF = Date.parse("2026-09-30T16:50:00Z");

const EVENT = "trace-dismissed-notifications-changed";

/**
 * Dismissed notification IDs, saved on the account so every device shows
 * the same alerts. IDs: rejected report id, or `p-<paymentId>` for payments.
 */
export function useDismissedNotifications() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setDismissed([]); setLoaded(false); return; }
    const { data } = await supabase
      .from("user_settings")
      .select("dismissed_notifications")
      .eq("user_id", user.id)
      .maybeSingle();
    setDismissed(((data as any)?.dismissed_notifications as string[]) ?? []);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [load]);

  const dismiss = useCallback(async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const { data } = await supabase
      .from("user_settings")
      .select("dismissed_notifications")
      .eq("user_id", user.id)
      .maybeSingle();
    const current = ((data as any)?.dismissed_notifications as string[]) ?? [];
    const next = Array.from(new Set([...current, ...ids])).slice(-500);
    setDismissed(next);
    await supabase
      .from("user_settings")
      .update({ dismissed_notifications: next } as any)
      .eq("user_id", user.id);
    window.dispatchEvent(new Event(EVENT));
  }, [user]);

  return { dismissed, loaded, dismiss };
}
