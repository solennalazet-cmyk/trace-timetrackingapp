import { useCallback, useEffect, useState } from "react";
import { Briefcase, HardHat } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * One-time overlay shown to a newly-signed-in user whose profile has not yet
 * picked a starting role. Lets them choose Freelancer or Employer, persists
 * the choice, and routes them to the matching default view.
 *
 * - Freelancer: keep the worker onboarding banner (WelcomeBanner) flow.
 * - Employer:   suppress the worker onboarding banner and land on /employer.
 */
const RoleChoiceOverlay = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { setActiveRole } = useRole();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"worker" | "employer" | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  // Defensive: ignore if we don't have profile yet.
  const needsChoice =
    !loading &&
    !!user &&
    !!profile &&
    !(profile as any).active_role &&
    dismissedFor !== user.id;

  const pick = useCallback(
    async (role: "worker" | "employer") => {
      if (!user) return;
      setBusy(role);
      // Persist active role + ensure both are available for later toggling.
      const currentAvailable = ((profile as any)?.available_roles as string[] | undefined) ?? [];
      const nextAvailable = Array.from(new Set([...currentAvailable, "worker", "employer"]));
      await supabase
        .from("profiles")
        .update({ active_role: role, available_roles: nextAvailable } as any)
        .eq("id", user.id);
      await setActiveRole(role);
      await refreshProfile();
      // Employers skip the worker onboarding banner entirely.
      if (role === "employer") {
        try { localStorage.setItem("trace_visited", "true"); } catch {}
        navigate("/employer", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
      setDismissedFor(user.id);
      setBusy(null);
    },
    [user, profile, setActiveRole, refreshProfile, navigate],
  );

  // Reset dismissed flag when user changes.
  useEffect(() => {
    if (!user) setDismissedFor(null);
  }, [user]);

  if (!needsChoice) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center px-6"
      style={{
        background: "hsl(var(--background) / 0.6)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-choice-title"
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 animate-scale-in"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 20px 60px -10px rgba(0,0,0,0.35)",
        }}
      >
        <h2
          id="role-choice-title"
          className="text-xl font-bold text-foreground text-center"
        >
          How will you use Trace?
        </h2>
        <p className="text-sm text-muted-foreground text-center mt-1.5">
          You can change this any time in Settings.
        </p>

        <div className="grid grid-cols-1 gap-3 mt-6">
          <button
            onClick={() => pick("worker")}
            disabled={busy !== null}
            className="group flex items-center gap-4 p-4 rounded-2xl border border-border bg-background hover:bg-muted/40 transition-colors text-left disabled:opacity-60"
          >
            <div className="w-11 h-11 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
              <HardHat className="w-5 h-5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">I'm a freelancer</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track time, send reports, get paid.
              </p>
            </div>
          </button>

          <button
            onClick={() => pick("employer")}
            disabled={busy !== null}
            className="group flex items-center gap-4 p-4 rounded-2xl border border-border bg-background hover:bg-muted/40 transition-colors text-left disabled:opacity-60"
          >
            <div className="w-11 h-11 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">I'm an employer</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Approve reports, monitor team activity, record payments.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleChoiceOverlay;
