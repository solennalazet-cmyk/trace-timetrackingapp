import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export type AppRole = "worker" | "employer";

interface RoleContextValue {
  activeRole: AppRole;
  availableRoles: AppRole[];
  /** False until the saved role is known — screens must not redirect before this. */
  roleLoaded: boolean;
  setActiveRole: (role: AppRole) => Promise<void>;
}

const ROLE_KEY = "trace_active_role";

const readCachedRole = (): AppRole | null => {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    return v === "employer" || v === "worker" ? v : null;
  } catch { return null; }
};

const RoleContext = createContext<RoleContextValue>({
  activeRole: "worker",
  availableRoles: ["worker", "employer"],
  roleLoaded: false,
  setActiveRole: async () => {},
});

export const useRole = () => useContext(RoleContext);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const { user, profile, refreshProfile, loading } = useAuth();
  const [activeRole, setActiveRoleState] = useState<AppRole>(() => readCachedRole() ?? "worker");
  const cachedRole = readCachedRole();

  // Sync from profile when it loads
  useEffect(() => {
    const raw = (profile as any)?.active_role;
    if (raw === "employer" || raw === "worker") {
      setActiveRoleState(raw);
      try { localStorage.setItem(ROLE_KEY, raw); } catch {}
    }
  }, [profile]);

  // Known as soon as the profile resolves, there is no signed-in user, or a
  // previously used role is cached on this device.
  const roleLoaded = (!loading && (!user || profile !== null)) || cachedRole !== null;

  const availableRoles = useMemo<AppRole[]>(() => {
    // V1: both roles always available; choice persisted per user.
    const arr = (profile as any)?.available_roles as string[] | undefined;
    if (Array.isArray(arr) && arr.length > 0) {
      const filtered = arr.filter((r): r is AppRole => r === "worker" || r === "employer");
      // Always offer both so user can opt-in to employer view.
      if (!filtered.includes("worker")) filtered.push("worker");
      if (!filtered.includes("employer")) filtered.push("employer");
      return filtered;
    }
    return ["worker", "employer"];
  }, [profile]);

  const setActiveRole = useCallback(
    async (role: AppRole) => {
      setActiveRoleState(role);
      try { localStorage.setItem(ROLE_KEY, role); } catch {}
      if (!user) return;
      await supabase.from("profiles").update({ active_role: role } as any).eq("id", user.id);
      await refreshProfile();
    },
    [user, refreshProfile],
  );

  return (
    <RoleContext.Provider value={{ activeRole, availableRoles, setActiveRole }}>
      {children}
    </RoleContext.Provider>
  );
};
