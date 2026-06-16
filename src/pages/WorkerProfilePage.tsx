import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, User, Briefcase, CalendarClock, FileText, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import WorkerFocusEditor, { type EditorField, type EditorKind } from "@/components/WorkerFocusEditor";
import WorkerCvCard from "@/components/WorkerCvCard";

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

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, email, phone, role, date_of_birth, agreed_daily_hours, agreed_start_time, agreed_end_time, engagement_start_date, engagement_end_date, cv_url, user_id, connected_user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) toast.error(error.message);
    setWorker(data as WorkerRow | null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!worker) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground">Worker not found.</div>;
  }

  const name = worker.name?.trim() || "Unnamed worker";
  const role = worker.role?.trim() || "Role not set";

  const shift = worker.agreed_start_time && worker.agreed_end_time
    ? `${worker.agreed_start_time} – ${worker.agreed_end_time}`
    : (worker.agreed_start_time || worker.agreed_end_time || "—");

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
      kind: "role",
      Icon: Briefcase,
      title: "Role",
      summary: worker.role?.trim() ? worker.role : "Set their job title",
    },
    {
      kind: "engagement",
      Icon: CalendarClock,
      title: "Schedule & engagement",
      summary: [
        worker.agreed_daily_hours != null ? `${worker.agreed_daily_hours}h/day` : null,
        shift !== "—" ? shift : null,
        worker.engagement_start_date ? `Since ${fmtDate(worker.engagement_start_date)}` : null,
      ].filter(Boolean).join(" · ") || "Add hours, shift, start date",
    },
  ];

  return (
    <div className="pt-4 pb-24 space-y-5">
      <Seo title={`${name} — Worker profile`} description={`Manage ${name}'s details, role, schedule and documents.`} path={`/workers/${worker.id}`} />

      <button onClick={() => navigate("/workers")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Workers
      </button>

      <header className="flex items-center gap-4 pt-1">
        <div className="h-16 w-16 rounded-full bg-foreground/10 text-foreground flex items-center justify-center text-2xl font-semibold shrink-0">
          {initials(worker.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight truncate">{name}</h1>
          <p className="text-sm text-muted-foreground truncate">{role}</p>
        </div>
      </header>

      <div className="space-y-2.5">
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
      </div>

      <WorkerFocusEditor
        open={editorOpen !== null}
        kind={editorOpen}
        clientId={worker.id}
        initial={worker}
        onClose={() => setEditorOpen(null)}
        onSaved={() => { setEditorOpen(null); load(); }}
      />
    </div>
  );
};

export default WorkerProfilePage;
export type { WorkerRow };
