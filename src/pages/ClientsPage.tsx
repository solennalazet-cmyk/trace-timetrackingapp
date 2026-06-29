import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Briefcase, ChevronDown, ChevronUp, Mail, Hash, Pencil, Trash2, Wallet } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousClients, saveAnonymousClient, getAnonymousProjects, saveAnonymousProject, deleteAnonymousClient } from "@/lib/anonymous-store";
import ClientFormModal from "@/components/ClientFormModal";
import { resolveExportColumns } from "@/lib/export-columns";
import ProjectFormModal from "@/components/ProjectFormModal";
import PaywallModal from "@/components/PaywallModal";
import SignInLink from "@/components/SignInLink";
import ClientPaymentsSection from "@/components/ClientPaymentsSection";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import { parsePositiveDecimalInput } from "@/lib/rate-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nif: string | null;
  business_address: string | null;
  currency: string | null;
  default_rate: number | null;
  payment_terms_days: number | null;
  billing_notes: string | null;
  export_columns: string[] | null;
  invited_email?: string | null;
  connection_status?: string | null;
}

interface Project {
  id: string;
  name: string;
  client_id: string | null;
  rate: number | null;
  currency: string | null;
}

interface MonthlyStats {
  clientId: string;
  hours: number;
  value: number;
}

interface ProjectStats {
  projectId: string;
  hours: number;
  value: number;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF",
};

const getInitial = (name: string) => name.charAt(0).toUpperCase();
const getAvatarColor = (name: string) => {
  const colors = [
    "bg-rose-200 text-rose-700", "bg-sky-200 text-sky-700", "bg-amber-200 text-amber-700",
    "bg-emerald-200 text-emerald-700", "bg-violet-200 text-violet-700", "bg-orange-200 text-orange-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const ClientsPage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectParentClient, setProjectParentClient] = useState<Client | null>(null);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState("");

  const isFree = profile?.plan === "free";

  const loadData = useCallback(async () => {
    setLoading(true);
    if (user) {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("clients").select("id, name, email, phone, nif, business_address, currency, default_rate, payment_terms_days, billing_notes, export_columns, site_address, site_lat, site_lng, site_radius_m, geolocation_override, invited_email, connection_status").eq("user_id", user.id).in("kind", ["account", "both"]).order("name"),
        supabase.from("projects").select("id, name, client_id, rate, currency").eq("user_id", user.id),
      ]);
      setClients((c ?? []) as Client[]);
      setProjects((p ?? []) as Project[]);

      // Monthly stats
      const now = new Date();
      const monthStart = toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
      const { data: entries } = await supabase.from("time_entries")
        .select("client_id, project_id, duration_minutes, billable_value")
        .eq("user_id", user.id).gte("entry_date", monthStart).not("client_id", "is", null).is("deleted_at", null);

      const statsMap: Record<string, { hours: number; value: number }> = {};
      const projStatsMap: Record<string, { hours: number; value: number }> = {};
      entries?.forEach((e) => {
        if (e.client_id) {
          if (!statsMap[e.client_id]) statsMap[e.client_id] = { hours: 0, value: 0 };
          statsMap[e.client_id].hours += (e.duration_minutes || 0) / 60;
          statsMap[e.client_id].value += (e.billable_value || 0);
        }
        if (e.project_id) {
          if (!projStatsMap[e.project_id]) projStatsMap[e.project_id] = { hours: 0, value: 0 };
          projStatsMap[e.project_id].hours += (e.duration_minutes || 0) / 60;
          projStatsMap[e.project_id].value += (e.billable_value || 0);
        }
      });
      setMonthlyStats(Object.entries(statsMap).map(([clientId, s]) => ({ clientId, ...s })));
      setProjectStats(Object.entries(projStatsMap).map(([projectId, s]) => ({ projectId, ...s })));
    } else {
      const ac = getAnonymousClients();
      setClients(ac.map((c: any) => ({ id: c.id, name: c.name, email: c.email ?? null, phone: c.phone ?? null, nif: c.nif ?? null, business_address: c.business_address ?? null, currency: c.currency ?? "EUR", default_rate: c.default_rate ?? null, payment_terms_days: c.payment_terms_days ?? null, billing_notes: c.billing_notes ?? null, export_columns: null })));
      const ap = getAnonymousProjects();
      setProjects(ap.map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id ?? null, rate: p.rate ?? null, currency: p.currency ?? null })));
      setMonthlyStats([]);
      setProjectStats([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const q = search.toLowerCase();
  const matchingProjectClientIds = new Set(
    projects.filter((p) => p.name.toLowerCase().includes(q) && p.client_id).map((p) => p.client_id!)
  );

  const filtered = clients.filter((c) => {
    if (!q) return true;
    if (c.name.toLowerCase().includes(q) || (c.nif ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)) return true;
    if (matchingProjectClientIds.has(c.id)) return true;
    return false;
  });

  const getClientStats = (id: string) => monthlyStats.find((s) => s.clientId === id);
  const getProjectStats = (id: string) => projectStats.find((s) => s.projectId === id);
  const getClientProjects = (clientId: string) => projects.filter((p) => p.client_id === clientId);

  // --- CRUD handlers ---
  const handleAddClientClick = () => {
    if (isFree && clients.length >= 1) {
      setPaywallMessage("You've reached the 1-client limit on the free plan. Upgrade to Pro for unlimited clients.");
      setPaywallOpen(true);
      return;
    }
    setEditingClient(null);
    setClientFormOpen(true);
  };

  const handleSaveClient = async (data: any) => {
    const siteFields = {
      site_address: data.site_address || null,
      site_lat: data.site_lat ?? null,
      site_lng: data.site_lng ?? null,
      site_radius_m: data.site_radius_m ?? 100,
      geolocation_override: data.geolocation_override ?? "inherit",
    };
    const inviteEmail = (data.invited_trace_email || "").trim().toLowerCase();
    const isNewInvite =
      inviteEmail.length > 0 &&
      data.connection_status !== "accepted" &&
      inviteEmail !== ((editingClient as any)?.invited_email || "").toLowerCase();
    const connectionFields = isNewInvite
      ? {
          invited_email: inviteEmail,
          connection_status: "pending",
          connection_initiated_by: "worker",
          invited_at: new Date().toISOString(),
        }
      : {};
    const parsedRate = parsePositiveDecimalInput(data.default_rate);


    if (user) {
      if (editingClient) {
        await supabase.from("clients").update({
          name: data.name, email: data.email || null, phone: data.phone || null, nif: data.nif || null,
          business_address: data.business_address || null,
          currency: data.currency, default_rate: parsedRate,
          payment_terms_days: data.payment_terms_days ? parseInt(data.payment_terms_days, 10) : null,
          billing_notes: data.billing_notes || null,
          export_columns: data.export_columns ?? null,
          ...siteFields,
          ...connectionFields,
        } as any).eq("id", editingClient.id);
        toast.success(isNewInvite ? "Client updated. Invite sent." : "Client updated.");
      } else {
        await supabase.from("clients").insert({
          name: data.name, email: data.email || null, phone: data.phone || null, nif: data.nif || null,
          business_address: data.business_address || null,
          currency: data.currency, default_rate: parsedRate,
          payment_terms_days: data.payment_terms_days ? parseInt(data.payment_terms_days, 10) : null,
          billing_notes: data.billing_notes || null,
          export_columns: data.export_columns ?? null,
          ...siteFields,
          ...connectionFields,
          user_id: user.id,
          kind: "account",
        } as any);
        toast.success(isNewInvite ? "Client added. Invite sent." : "Client added.");
      }
    } else {
      const id = editingClient?.id ?? `local-${Date.now()}`;
      saveAnonymousClient({ id, name: data.name, email: data.email, phone: data.phone, nif: data.nif, business_address: data.business_address, currency: data.currency, default_rate: parsedRate, payment_terms_days: data.payment_terms_days ? parseInt(data.payment_terms_days, 10) : null, billing_notes: data.billing_notes });
      toast.success(editingClient ? "Client updated." : "Client added.");
    }
    setClientFormOpen(false);
    loadData();
  };

  const handleDeleteClient = async () => {
    if (!deleteClientId) return;
    if (user) {
      // If this row also appears in the Freelancers view (kind = 'both'),
      // downgrade to 'contractor' so it stays there. Otherwise hard delete.
      const { data: row } = await supabase
        .from("clients")
        .select("kind")
        .eq("id", deleteClientId)
        .maybeSingle();
      if ((row as any)?.kind === "both") {
        await supabase.from("clients").update({ kind: "contractor" }).eq("id", deleteClientId);
      } else {
        const clientProjects = projects.filter((p) => p.client_id === deleteClientId).map((p) => p.id);
        await supabase.from("time_entries").delete().eq("client_id", deleteClientId);
        if (clientProjects.length > 0) {
          await supabase.from("time_entries").delete().in("project_id", clientProjects);
        }
        await supabase.from("projects").delete().eq("client_id", deleteClientId);
        await supabase.from("clients").delete().eq("id", deleteClientId);
      }
    } else {
      deleteAnonymousClient(deleteClientId);
    }
    setDeleteClientId(null);
    setClientFormOpen(false);
    setExpandedId(null);
    setSwipedId(null);
    toast.success("Client deleted.");
    loadData();
  };

  const handleAddProjectClick = (client: Client) => {
    if (isFree && projects.length >= 2) {
      setPaywallMessage("You've reached the 2-project limit on the free plan. Upgrade to Pro for unlimited projects.");
      setPaywallOpen(true);
      return;
    }
    setEditingProject(null);
    setProjectParentClient(client);
    setProjectFormOpen(true);
  };

  const handleSaveProject = async (data: any) => {
    if (!projectParentClient) return;
    const parsedProjectRate = parsePositiveDecimalInput(data.rate);
    if (user) {
      if (editingProject) {
        await supabase.from("projects").update({
          name: data.name, rate: parsedProjectRate, currency: data.currency,
        }).eq("id", editingProject.id);
        toast.success("Project updated.");
      } else {
        await supabase.from("projects").insert({
          name: data.name, client_id: projectParentClient.id,
          rate: parsedProjectRate, currency: data.currency,
          user_id: user.id,
        });
        toast.success("Project added.");
      }
    } else {
      const id = editingProject?.id ?? `local-${Date.now()}`;
      saveAnonymousProject({ id, name: data.name, client_id: projectParentClient.id, rate: parsedProjectRate, currency: data.currency });
      toast.success(editingProject ? "Project updated." : "Project added.");
    }
    setProjectFormOpen(false);
    loadData();
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectId) return;
    if (user) {
      await supabase.from("time_entries").update({ project_id: null }).eq("project_id", deleteProjectId);
      await supabase.from("projects").delete().eq("id", deleteProjectId);
    }
    setDeleteProjectId(null);
    setProjectFormOpen(false);
    toast.success("Project deleted.");
    loadData();
  };

  const sym = (currency: string | null) => CURRENCY_SYMBOLS[currency ?? "EUR"] ?? "€";

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">Loading…</div>;
  }

  return (
    <div className="pb-24 px-4">
      <Seo title={"Clients & Projects — Trace"} description={"Manage your clients, nested projects, hourly rates and budgets for accurate freelance time tracking."} path={"/clients"} />
      <h1 className="text-2xl font-bold tracking-tight mb-3 mt-2">Clients</h1>
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search clients, projects..."
          aria-label="Search clients and projects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Add Client */}
      <Button
        className="w-full mb-4 gap-2 rounded-xl h-10"
        onClick={handleAddClientClick}
      >
        <Plus className="w-4 h-4" /> Add client
      </Button>

      {/* Empty state */}
      {clients.length === 0 && !search && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Briefcase className="w-12 h-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground text-sm text-center">
            No clients yet.<br />Add your first client to start tracking billable work.
          </p>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 px-6 font-bold" onClick={handleAddClientClick}>
            <Plus className="w-4 h-4 mr-2" /> Add client
          </Button>
          <SignInLink />
        </div>
      )}

      {/* No search results */}
      {search && filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No results match your search.</p>
      )}

      {/* Client cards */}
      <div className="space-y-3">
        {filtered.map((client) => {
          const expanded = expandedId === client.id;
          const stats = getClientStats(client.id);
          const clientProjects = getClientProjects(client.id);

          return (
            <div key={client.id} className="relative rounded-xl overflow-hidden">
              {/* Swipe-revealed Delete button (behind the card) */}
              <button
                aria-label={`Delete ${client.name}`}
                className="absolute inset-y-0 right-0 w-24 bg-destructive text-destructive-foreground flex items-center justify-center gap-1.5 text-sm font-semibold"
                onClick={() => { setDeleteClientId(client.id); }}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>

              <div
                className="relative rounded-xl border border-border bg-card overflow-hidden transition-transform duration-200 ease-out"
                style={{ transform: swipedId === client.id ? "translateX(-96px)" : "translateX(0)" }}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  swipeStartRef.current = { x: t.clientX, y: t.clientY };
                }}
                onTouchEnd={(e) => {
                  const start = swipeStartRef.current;
                  if (!start) return;
                  const t = e.changedTouches[0];
                  const dx = t.clientX - start.x;
                  const dy = t.clientY - start.y;
                  swipeStartRef.current = null;
                  if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll
                  if (dx < -40) setSwipedId(client.id);
                  else if (dx > 40) setSwipedId((cur) => (cur === client.id ? null : cur));
                }}
              >
                {/* Tappable row → opens dedicated profile page */}
                <button
                  className="flex items-center w-full px-4 py-3 text-left gap-3"
                  onClick={() => {
                    if (swipedId === client.id) { setSwipedId(null); return; }
                    navigate(`/clients/${client.id}`);
                  }}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getAvatarColor(client.name)}`}>
                    {getInitial(client.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {clientProjects.length} {clientProjects.length === 1 ? "project" : "projects"}
                      {client.default_rate != null ? ` · ${sym(client.currency)}${client.default_rate}/h` : ""}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 -rotate-90" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Client Form Modal */}
      <ClientFormModal
        open={clientFormOpen}
        onOpenChange={setClientFormOpen}
        onSave={handleSaveClient}
        onDelete={editingClient ? () => setDeleteClientId(editingClient.id) : undefined}
        initial={editingClient ? {
          name: editingClient.name, email: editingClient.email ?? "", phone: editingClient.phone ?? "",
          nif: editingClient.nif ?? "", business_address: editingClient.business_address ?? "", currency: editingClient.currency ?? "EUR",
          default_rate: editingClient.default_rate != null ? String(editingClient.default_rate) : "",
          payment_terms_days: editingClient.payment_terms_days != null ? String(editingClient.payment_terms_days) : "",
          billing_notes: editingClient.billing_notes ?? "",
          rate_unit: "hour",
          export_columns: resolveExportColumns(editingClient.export_columns),
          site_address: (editingClient as any).site_address ?? "",
          site_lat: (editingClient as any).site_lat ?? null,
          site_lng: (editingClient as any).site_lng ?? null,
          site_radius_m: (editingClient as any).site_radius_m ?? 100,
          geolocation_override: (editingClient as any).geolocation_override ?? "inherit",
          invited_trace_email: (editingClient as any).invited_email ?? "",
          connection_status: (editingClient as any).connection_status ?? null,
        } : null}
        title={editingClient ? "Edit client" : "Add client"}
      />

      {/* Project Form Modal */}
      <ProjectFormModal
        open={projectFormOpen}
        onOpenChange={setProjectFormOpen}
        onSave={handleSaveProject}
        onDelete={editingProject ? () => setDeleteProjectId(editingProject.id) : undefined}
        initial={editingProject ? {
          name: editingProject.name,
          rate: editingProject.rate != null ? String(editingProject.rate) : "",
          rate_unit: "hour",
          currency: editingProject.currency ?? projectParentClient?.currency ?? "EUR",
        } : null}
        clientCurrency={projectParentClient?.currency ?? "EUR"}
        clientRate={projectParentClient?.default_rate}
        title={editingProject ? "Edit Project" : "Add Project"}
      />

      {/* Delete Client Confirm */}
      <AlertDialog open={!!deleteClientId} onOpenChange={(o) => { if (!o) setDeleteClientId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {clients.find((c) => c.id === deleteClientId)?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All data assigned to this Client will be deleted, including its projects and time entries. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClient} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Project Confirm */}
      <AlertDialog open={!!deleteProjectId} onOpenChange={(o) => { if (!o) setDeleteProjectId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {projects.find((p) => p.id === deleteProjectId)?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This will not delete associated time entries.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Paywall */}
      <PaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} body={paywallMessage} />
    </div>
  );
};

export default ClientsPage;
