import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";

/**
 * Count of submitted_reports awaiting review for the current employer.
 * Refreshes on mount, on window focus, and when a `pending-reports-changed`
 * custom event is dispatched.
 */
export const usePendingReportsCount = () => {
  const { user } = useAuth();
  const { activeRole } = useRole();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || activeRole !== "employer") {
      setCount(0);
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      const { count: c } = await supabase
        .from("submitted_reports")
        .select("id", { count: "exact", head: true })
        .eq("employer_user_id", user.id)
        .eq("status", "submitted");
      if (!cancelled) setCount(c ?? 0);
    };

    refresh();
    const onFocus = () => refresh();
    const onCustom = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pending-reports-changed", onCustom);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pending-reports-changed", onCustom);
    };
  }, [user, activeRole]);

  return count;
};
