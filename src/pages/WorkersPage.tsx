import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, Mail, X, Clock, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import AddFreelancerModal from "@/components/AddFreelancerModal";
import Seo from "@/components/Seo";

interface FreelancerInvite {
  id: string;
  invited_email: string;
  invited_name: string | null;
  status: string;
  invited_at: string;
}

interface ConnectedFreelancer {
  id: string;
  name: string;
  role: string | null;
  user_id: string;
}

const WorkersPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invites, setInvites] = useState<FreelancerInvite[]>([]);
  const [freelancers, setFreelancers] = useState<ConnectedFreelancer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [invitesRes, listRes] = await Promise.all([
      supabase
        .from("worker_invites")
        .select("id, invited_email, invited_name, status, invited_at")
        .eq("employer_user_id", user.id)
        .eq("status", "pending")
        .order("invited_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, name, role, user_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    if (invitesRes.error) toast.error(invitesRes.error.message);
    else setInvites(invitesRes.data ?? []);
    if (listRes.error) toast.error(listRes.error.message);
    else setFreelancers((listRes.data ?? []) as ConnectedFreelancer[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (firstName: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("clients")
      .insert({ user_id: user.id, name: firstName })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }
    setModalOpen(false);
    navigate(`/workers/${data.id}`);
  };

  const handleCancel = async (id: string) => {
    const { error } = await supabase.from("worker_invites").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setInvites((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="pt-6 space-y-4 pb-24">
      <Seo title={"Freelancers — Trace for Employers"} description={"Manage your team: roles, contact details, schedules, and documents."} path={"/workers"} />
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Freelancers</h1>
          <p className="text-sm text-muted-foreground">Tap a freelancer to open their profile.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="rounded-xl gap-2 h-10">
          <Plus className="h-4 w-4" /> Add freelancer
        </Button>
      </header>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : freelancers.length === 0 && invites.length === 0 ? (
        <Card className="p-6 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No freelancers yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tap <span className="font-medium text-foreground">Add freelancer</span> to create their profile.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {freelancers.map((w) => (
            <button key={w.id} className="w-full text-left" onClick={() => navigate(`/workers/${w.id}`)}>
              <Card className="p-4 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                <div className="h-11 w-11 rounded-full bg-foreground/10 text-foreground flex items-center justify-center font-semibold shrink-0">
                  {w.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{w.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {w.role?.trim() || "Role not set"}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Card>
            </button>
          ))}

          {invites.map((i) => (
            <Card key={i.id} className="p-4 flex items-center gap-3 bg-secondary">
              <div className="h-11 w-11 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{i.invited_name || i.invited_email}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Pending · {i.invited_email}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleCancel(i.id)} aria-label="Cancel invite">
                <X className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <AddFreelancerModal open={modalOpen} onOpenChange={setModalOpen} onCreate={handleCreate} />
    </div>
  );
};

export default WorkersPage;
