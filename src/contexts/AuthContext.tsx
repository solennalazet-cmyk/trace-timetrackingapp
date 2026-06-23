import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string | null;
  plan: string | null;
  trial_started_at: string | null;
  subscription_status: string | null;
  created_at: string | null;
  current_period_end: string | null;
  business_name: string | null;
  business_address: string | null;
  tax_id: string | null;
  show_business_on_export: boolean | null;
  payment_link: string | null;
  phone: string | null;
  active_role: string | null;
  available_roles: string[] | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, plan, trial_started_at, subscription_status, created_at, current_period_end, business_name, business_address, tax_id, show_business_on_export, payment_link, phone, active_role, available_roles")
      .eq("id", userId)
      .single();
    setProfile(data as Profile | null);
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  useEffect(() => {
    // Track whether the user has explicitly signed out via signOut().
    // If they haven't, treat a SIGNED_OUT event as a transient token-refresh
    // failure (network blip, phone sleep) and try to recover the session
    // instead of dropping the user back to the login screen.
    const explicitSignOut = { current: false };
    (window as any).__traceExplicitSignOut = explicitSignOut;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === "SIGNED_OUT" && !explicitSignOut.current) {
          // Don't immediately clear the UI. Try to recover.
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            setSession(data.session);
            setLoading(false);
            return;
          }
          // Could not recover — fall through and clear.
        }
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          explicitSignOut.current = false;
        }
        setSession(newSession);
        if (newSession?.user) {
          setProfile((current) => current?.id === newSession.user.id ? current : null);
          setTimeout(() => fetchProfile(newSession.user.id), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setProfile((current) => current?.id === session.user.id ? current : null);
        fetchProfile(session.user.id);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        supabase
          .from("time_entries")
          .delete()
          .eq("user_id", session.user.id)
          .lt("deleted_at", sevenDaysAgo.toISOString())
          .not("deleted_at", "is", null)
          .then(() => {});
      }
      setLoading(false);
    });

    // Proactively refresh the session whenever the tab/app comes back to the
    // foreground. On mobile the JS timers used by autoRefreshToken pause
    // when the phone sleeps, so the access token can expire silently. Hitting
    // refreshSession() on resume avoids the "signed out on wake" bug.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.refreshSession().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);



  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
