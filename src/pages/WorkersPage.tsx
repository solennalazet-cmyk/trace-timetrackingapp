import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, Mail, X, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import WorkerInviteModal from "@/components/WorkerInviteModal";

interface WorkerInvite {
  id: string;
  invited_email: string;
  invited_name: string | null;
  status: string;
  invited_at: string;
}

interface ConnectedWorker {
  id: string; // clients row id
  name: string;
  email: string | null;
  user_id: string; // worker user id (owner of the clients row)
}

const WorkersPage = () => {
  const { user } = useAuth();
  const [invites, setInvites] = useState<WorkerInvite[]>([]);
  const [workers, setWorkers] = useState<ConnectedWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [invitesRes, workersRes] = await Promise.all([
      supabase
        .from("worker_invites")
        .select("id, invited_email, invited_name, status, invited_at")
        .eq("employer_user_id", user.id)
        .eq("status", "pending")
        .order("invited_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, name, email, user_id")
        .eq("connected_user_id", user.id)
        .eq("connection_status", "accepted"),
    ]);
    if (invitesRes.error) toast.error(invitesRes.error.message);
    else setInvites(invitesRes.data ?? []);
    if (workersRes.error) toast.error(workersRes.error.message);
    else setWorkers(workersRes.data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInvite = async ({ email, name }: { email: string; name?: string }) => {
    if (!user) return;
    const trimmed = email.trim().toLowerCase();

    // Prevent duplicate pending invite
    const existing = invites.find((i) => i.invited_email.toLowerCase() === trimmed);
    if (existing) {
      toast.error("Already invited — invite is still pending.");
      return;
    }

    const { error } = await supabase.from("worker_invites").insert({
      employer_user_id: user.id,
      invited_email: trimmed,
      invited_name: name ?? null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invite sent. They'll be connected when they sign up.");
    setModalOpen(false);
    await load();
  };

  const handleCancel = async (id: string) => {
    const { error } = await supabase
      .from("worker_invites")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInvites((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="pt-6 space-y-4 pb-24">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Workers</h1>
          <p className="text-sm text-muted-foreground">People who submit reports to you.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="rounded-xl gap-2 h-10">
          <Plus className="h-4 w-4" />
          Add worker
        </Button>
      </header>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : workers.length === 0 && invites.length === 0 ? (
        <Card className="p-6 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No workers yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tap <span className="font-medium text-foreground">Add worker</span> to invite someone by email.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {workers.map((w) => (
            <Card key={w.id} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-foreground/10 text-foreground flex items-center justify-center font-semibold">
                {w.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{w.name}</p>
                {w.email && <p className="text-xs text-muted-foreground truncate">{w.email}</p>}
              </div>
            </Card>
          ))}

          {invites.map((i) => (
            <Card key={i.id} className="p-4 flex items-center gap-3 bg-secondary">
              <div className="h-10 w-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{i.invited_name || i.invited_email}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Pending · {i.invited_email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => handleCancel(i.id)}
                aria-label="Cancel invite"
              >
                <X className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <WorkerInviteModal open={modalOpen} onOpenChange={setModalOpen} onInvite={handleInvite} />
    </div>
  );
};

export default WorkersPage;
