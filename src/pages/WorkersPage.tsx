import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, Mail, X, Clock, ChevronRight, Pencil, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import AddFreelancerModal, { type NewFreelancerPayload } from "@/components/AddFreelancerModal";
import SwipeToDeleteRow from "@/components/SwipeToDeleteRow";
import Seo from "@/components/Seo";
import ConnectionInvitesCard from "@/components/ConnectionInvitesCard";
import WorkersWeekSchedule from "@/components/WorkersWeekSchedule";


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
  const [deleteTarget, setDeleteTarget] = useState<ConnectedFreelancer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline rename on the freelancer card
  const [renameTarget, setRenameTarget] = useState<ConnectedFreelancer | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

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
        .in("kind", ["contractor", "both"])
        .order("created_at", { ascending: false }),
    ]);
    if (invitesRes.error) toast.error(invitesRes.error.message);
    else setInvites(invitesRes.data ?? []);
    if (listRes.error) toast.error(listRes.error.message);
    else setFreelancers((listRes.data ?? []) as ConnectedFreelancer[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (payload: NewFreelancerPayload) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("clients")
      .insert({ user_id: user.id, kind: "contractor", ...payload })
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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // Hard delete — permanent removal of this freelancer and all related data.
    const { error } = await supabase.from("clients").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${deleteTarget.name} removed from Freelancers.`);
    setDeleteTarget(null);
    load();
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { toast.error("Name is required."); return; }
    setRenameSaving(true);
    const { error } = await supabase.from("clients").update({ name: trimmed }).eq("id", renameTarget.id);
    setRenameSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Freelancer renamed.");
    setRenameTarget(null);
    setRenameValue("");
    load();
  };

  return (
    <div className="pt-6 space-y-4 pb-24">
      <Seo title={"Freelancers — Trace for Employers"} description={"Manage your team: roles, contact details, schedules, and documents."} path={"/workers"} />
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Freelancers</h1>
          <p className="text-sm text-muted-foreground">Tap to open · swipe left to delete.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="rounded-xl gap-2 h-10">
          <Plus className="h-4 w-4" /> Add freelancer
        </Button>
      </header>
      <ConnectionInvitesCard />
      <WorkersWeekSchedule />



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
            <SwipeToDeleteRow key={w.id} onDelete={() => setDeleteTarget(w)}>
              <div className="w-full text-left">
                <Card className="p-4 flex items-center gap-1 hover:bg-muted/40 transition-colors rounded-xl">
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => navigate(`/workers/${w.id}`)}
                  >
                    <div className="h-11 w-11 rounded-full bg-foreground/10 text-foreground flex items-center justify-center font-semibold shrink-0">
                      {w.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{w.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {w.role?.trim() || "Role not set"}
                      </p>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameTarget(w);
                      setRenameValue(w.name);
                    }}
                    aria-label={`Rename ${w.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Card>
              </div>
            </SwipeToDeleteRow>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All data associated with this freelancer — profile details, schedule, documents and pending invites — will be permanently lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Proceed"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline rename sheet */}
      <Sheet open={!!renameTarget} onOpenChange={(o) => { if (!o) { setRenameTarget(null); setRenameValue(""); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl p-0 flex flex-col max-h-[calc(100dvh-1rem)]">
          <SheetHeader className="text-left px-5 pt-4 pb-3 shrink-0">
            <SheetTitle className="text-lg">Rename freelancer</SheetTitle>
            <p className="text-xs text-muted-foreground">Choose the display name you see in reports and lists.</p>
          </SheetHeader>
          <div className="px-5 pb-2 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</Label>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="e.g. Solenn Dupont"
                className="h-11 text-sm rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-border bg-card shrink-0">
            <Button
              variant="ghost"
              className="flex-1 h-11 rounded-xl"
              onClick={() => { setRenameTarget(null); setRenameValue(""); }}
              disabled={renameSaving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl"
              onClick={handleRename}
              disabled={renameSaving || !renameValue.trim()}
            >
              {renameSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default WorkersPage;
