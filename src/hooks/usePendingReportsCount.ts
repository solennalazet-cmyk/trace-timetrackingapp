import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";

/**
 * Live count of submitted_reports awaiting employer review for the current user.
 * Returns 0 when the user isn't acting as employer.
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

    const channel = supabase
      .channel(`pending-reports-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submitted_reports",
          filter: `employer_user_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, activeRole]);

  return count;
};
