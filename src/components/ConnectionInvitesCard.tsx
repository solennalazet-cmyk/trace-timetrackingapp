import { useCallback, useEffect, useState } from "react";
import { Check, X, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PendingInvite {
  id: string;
  name: string;
  invited_email: string | null;
  user_id: string;
}

/**
 * Action card shown on Home when the signed-in user has incoming
 * connection invites (someone added them as their client/employer).
 * Mirrors the Unassigned-sessions card visual pattern.
 */
const ConnectionInvitesCard = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { setActiveRole } = useRole();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("id, name, invited_email, user_id")
      .eq("connection_status", "pending");
    // RLS already scopes this to invites addressed to the current user.
    setInvites(((data ?? []) as any) as PendingInvite[]);
  }, [user]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("trace-invites-changed", handler);
    return () => window.removeEventListener("trace-invites-changed", handler);
  }, [load]);

  const handleAccept = async (invite: PendingInvite) => {
    if (!user) return;
    setWorking(invite.id);
    const { error } = await supabase
      .from("clients")
      .update({ connection_status: "accepted", connected_user_id: user.id } as any)
      .eq("id", invite.id);
    if (error) {
      toast.error("Couldn't accept invite. Please try again.");
      setWorking(null);
      return;
    }
    // Grant the employer role and switch to it.
    const currentRoles = (profile as any)?.available_roles as string[] | undefined;
    const next = Array.from(new Set([...(currentRoles ?? ["worker"]), "employer"]));
    await supabase.from("profiles").update({ available_roles: next, active_role: "employer" } as any).eq("id", user.id);
    await refreshProfile();
    await setActiveRole("employer");
    toast.success(`Connected with ${invite.name}.`);
    setWorking(null);
    load();
  };

  const handleDecline = async (invite: PendingInvite) => {
    setWorking(invite.id);
    const { error } = await supabase
      .from("clients")
      .update({ connection_status: "rejected" } as any)
      .eq("id", invite.id);
    if (error) {
      toast.error("Couldn't decline invite. Please try again.");
      setWorking(null);
      return;
    }
    toast("Invite declined.");
    setWorking(null);
    load();
  };

  if (!user || invites.length === 0) return null;

  return (
    <div className="space-y-2 mt-4">
      {invites.map((invite) => (
        <Card key={invite.id} className="p-4 bg-card border-border shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {invite.name} wants to connect
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accepting lets them submit reports to you for review and payment.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="rounded-full h-8 px-4 gap-1"
                  onClick={() => handleAccept(invite)}
                  disabled={working === invite.id}
                >
                  <Check className="w-3.5 h-3.5" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full h-8 px-4 gap-1 text-muted-foreground"
                  onClick={() => handleDecline(invite)}
                  disabled={working === invite.id}
                >
                  <X className="w-3.5 h-3.5" /> Decline
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default ConnectionInvitesCard;
