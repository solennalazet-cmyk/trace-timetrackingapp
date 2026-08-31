import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, User, Briefcase, CalendarClock, ChevronRight, Send, CheckCircle2, Trash2, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import WorkerFocusEditor, { type EditorKind } from "@/components/WorkerFocusEditor";
import WorkerCvCard from "@/components/WorkerCvCard";
import WorkerDocumentsCard from "@/components/WorkerDocumentsCard";
import WorkerInviteModal from "@/components/WorkerInviteModal";
import ImportReportSheet from "@/components/ImportReportSheet";
import WorkerStatusCard from "@/components/WorkerStatusCard";

interface WorkerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  date_of_birth: string | null;
  agreed_daily_hours: number | null;
  agreed_start_time: string | null;
  agreed_end_time: string | null;
  engagement_start_date: string | null;
  engagement_end_date: string | null;
  scheduled_days: number[] | null;
  cv_url: string | null;
  user_id: string;
  connected_user_id: string | null;
}

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return s; }
};

const initials = (name: string | null) => (name?.trim()?.slice(0, 1) ?? "?").toUpperCase();

const WorkerProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [worker, setWorker] = useState<WorkerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState<EditorKind | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, email, phone, role, date_of_birth, agreed_daily_hours, agreed_start_time, agreed_end_time, engagement_start_date, engagement_end_date, scheduled_days, cv_url, user_id, connected_user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) toast.error(error.message);
    setWorker(data as WorkerRow | null);
    setLoading(false);

    // Check pending invite for this freelancer's email
    if (data?.email && user) {
      const { data: inv } = await supabase
        .from("worker_invites")
        .select("id")
        .eq("employer_user_id", user.id)
        .eq("invited_email", data.email.toLowerCase())
        .eq("status", "pending")
        .maybeSingle();
      setInvitePending(!!inv);
    } else {
      setInvitePending(false);
    }
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async ({ email, name }: { email: string; name?: string }): Promise<string | null> => {
    if (!user) return null;
    const trimmed = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from("worker_invites")
      .insert({
        employer_user_id: user.id,
        invited_email: trimmed,
        invited_name: name ?? worker?.name ?? null,
      })
      .select("invite_token")
      .single();
    if (error) { toast.error(error.message); return null; }
    // Keep the freelancer's email in sync if not already set
    if (worker && !worker.email) {
      await supabase.from("clients").update({ email: trimmed }).eq("id", worker.id);
    }
    toast.success("Invite saved. Share it now.");
    await load();
    return (data?.invite_token as string) ?? null;
  };

  const handleDisconnect = async () => {
    if (!worker || !user) return;
    // Clear the connection link and any pending invite for this freelancer.
    const { error } = await supabase
      .from("clients")
      .update({ connected_user_id: null } as any)
      .eq("id", worker.id);
    if (error) { toast.error(error.message); return; }
    if (worker.email) {
      await supabase
        .from("worker_invites")
        .delete()
        .eq("employer_user_id", user.id)
        .eq("invited_email", worker.email.toLowerCase())
        .eq("status", "pending");
    }
    toast.success("Disconnected.");
    load();
  };

  const handleDelete = async () => {
    if (!worker) return;
    setDeleting(true);
    const { error } = await supabase.from("clients").delete().eq("id", worker.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Freelancer deleted.");
    setDeleteOpen(false);
    navigate("/workers");
  };

  if (loading) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!worker) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground">Freelancer not found.</div>;
  }

  const name = worker.name?.trim() || "Unnamed freelancer";
  const role = worker.role?.trim() || "Role not set";
  const connected = !!worker.connected_user_id;

  const shift = worker.agreed_start_time && worker.agreed_end_time
    ? `${worker.agreed_start_time} – ${worker.agreed_end_time}`
    : (worker.agreed_start_time || worker.agreed_end_time || "—");

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const scheduledSummary = (() => {
    const days = worker.scheduled_days ?? [0, 1, 2, 3, 4, 5, 6];
    if (days.length === 7) return "Every day";
    if (days.length === 0) return "No days set";
    return days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => dayLabels[d])
      .join(", ");
  })();

  type CardDef = { kind: EditorKind; Icon: typeof User; title: string; summary: string };
  const cards: CardDef[] = [
    {
      kind: "identity",
      Icon: User,
      title: "Identity & contact",
      summary: [worker.email, worker.phone, worker.date_of_birth ? `Born ${fmtDate(worker.date_of_birth)}` : null]
        .filter(Boolean).join(" · ") || "Add email, phone, date of birth",
    },
    {
      kind: "engagement",
      Icon: CalendarClock,
      title: "Schedule & engagement",
      summary: [
        worker.agreed_daily_hours != null ? `${worker.agreed_daily_hours}h/day` : null,
        shift !== "—" ? shift : null,
        scheduledSummary,
        worker.engagement_start_date ? `Since ${fmtDate(worker.engagement_start_date)}` : null,
      ].filter(Boolean).join(" · ") || "Add hours, shift, days, start date",
    },
  ];

  return (
    <div className="pt-4 pb-24 space-y-5">
      <Seo title={`${name} — Freelancer profile`} description={`Manage ${name}'s details, role, schedule and documents.`} path={`/workers/${worker.id}`} />

      <button onClick={() => navigate("/workers")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Freelancers
      </button>

      <div className="pt-1">
        <header className="flex items-start gap-3">
          <button onClick={() => setEditorOpen("role")} className="flex items-center gap-4 flex-1 min-w-0 text-left group">
            <div className="h-16 w-16 rounded-full bg-foreground/10 text-foreground flex items-center justify-center text-2xl font-semibold shrink-0">
              {initials(worker.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight truncate">{name}</h1>
              <p className="text-sm text-muted-foreground truncate group-hover:text-foreground transition-colors">{role} <span className="text-muted-foreground/60">· tap to edit</span></p>
            </div>
          </button>
          <WorkerStatusCard
            clientId={worker.id}
            startDate={worker.engagement_start_date}
            endDate={worker.engagement_end_date}
            onSaved={load}
          />
        </header>

        {/* Discrete Trace-connection CTA */}
        <div className="mt-2 ml-20 flex items-center gap-1.5 text-[11px] flex-wrap">
          {connected ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-nav-bg shrink-0" />
              <span className="text-muted-foreground">Connected on Trace</span>
              <span className="text-muted-foreground/50">·</span>
              <button
                onClick={handleDisconnect}
                className="text-muted-foreground hover:text-destructive underline-offset-2 hover:underline"
              >
                Disconnect
              </button>
            </>
          ) : invitePending ? (
            <>
              <Send className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Invite pending</span>
              <span className="text-muted-foreground/50">·</span>
              <button
                onClick={() => setInviteOpen(true)}
                className="text-foreground hover:underline underline-offset-2"
              >
                Manage
              </button>
            </>
          ) : (
            <button
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              <Send className="w-3 h-3" /> Invite to Trace
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <WorkerStatusCard
          clientId={worker.id}
          startDate={worker.engagement_start_date}
          endDate={worker.engagement_end_date}
          onSaved={load}
        />

        {cards.map(({ kind, Icon, title, summary }) => (
          <button
            key={kind}
            onClick={() => setEditorOpen(kind)}
            className="w-full text-left"
          >
            <Card className="p-4 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{summary}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </button>
        ))}

        <WorkerCvCard
          clientId={worker.id}
          employerUserId={user?.id ?? ""}
          cvUrl={worker.cv_url}
          onChange={load}
        />

        <WorkerDocumentsCard
          clientId={worker.id}
          employerUserId={user?.id ?? ""}
        />




        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="w-full text-left"
        >
          <Card className="p-4 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                <FileUp className="w-4 h-4 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Import report</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  Upload a Trace PDF this freelancer emailed you
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </Card>
        </button>

        {/* Danger zone */}
        <div className="pt-4">
          <Button
            variant="ghost"
            className="w-full h-11 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete freelancer
          </Button>
        </div>
      </div>

      <WorkerFocusEditor
        open={editorOpen !== null}
        kind={editorOpen}
        clientId={worker.id}
        initial={worker}
        onClose={() => setEditorOpen(null)}
        onSaved={() => { setEditorOpen(null); load(); }}
      />

      <WorkerInviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={handleInvite}
      />

      <ImportReportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        clientId={worker.id}
        clientName={name}
        onImported={load}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All data associated with this freelancer — profile details, schedule, documents and pending invites — will be permanently lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Proceed"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkerProfilePage;
export type { WorkerRow };
