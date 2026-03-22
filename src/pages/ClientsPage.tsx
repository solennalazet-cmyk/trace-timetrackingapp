import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Briefcase, ChevronDown, ChevronUp, Mail, Hash, Pencil, Trash2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousClients, saveAnonymousClient, getAnonymousProjects, saveAnonymousProject } from "@/lib/anonymous-store";
import ClientFormModal from "@/components/ClientFormModal";
import ProjectFormModal from "@/components/ProjectFormModal";
import PaywallModal from "@/components/PaywallModal";
import SignInLink from "@/components/SignInLink";
import { toast } from "sonner";
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
  nif: string | null;
  currency: string | null;
  default_rate: number | null;
}

interface Project {
  id: string;
  name: string;
  client_id: string | null;
  rate: number | null;
  currency: string | null;
}

interface Task {
  id: string;
  name: string;
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
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskEntryCounts, setTaskEntryCounts] = useState<Record<string, number>>({});
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState("");
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
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
      const [{ data: c }, { data: p }, { data: tk }] = await Promise.all([
        supabase.from("clients").select("id, name, email, nif, currency, default_rate").eq("user_id", user.id).order("name"),
        supabase.from("projects").select("id, name, client_id, rate, currency").eq("user_id", user.id),
        supabase.from("tasks").select("id, name").eq("user_id", user.id).order("name"),
      ]);
      setClients((c ?? []) as Client[]);
      setProjects((p ?? []) as Project[]);
      setTasks((tk ?? []) as Task[]);

      // Monthly stats + task entry counts
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const [{ data: entries }, { data: taskEntries }] = await Promise.all([
        supabase.from("time_entries")
          .select("client_id, project_id, duration_minutes, billable_value")
          .eq("user_id", user.id).gte("entry_date", monthStart).not("client_id", "is", null).is("deleted_at", null),
        supabase.from("time_entries")
          .select("task_id")
          .eq("user_id", user.id).not("task_id", "is", null).is("deleted_at", null),
      ]);

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

      // Task entry counts
      const teCounts: Record<string, number> = {};
      taskEntries?.forEach((e) => {
        if (e.task_id) teCounts[e.task_id] = (teCounts[e.task_id] || 0) + 1;
      });
      setTaskEntryCounts(teCounts);
    } else {
      const ac = getAnonymousClients();
      setClients(ac.map((c: any) => ({ id: c.id, name: c.name, email: c.email ?? null, nif: c.nif ?? null, currency: c.currency ?? "EUR", default_rate: c.default_rate ?? null })));
      const ap = getAnonymousProjects();
      setProjects(ap.map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id ?? null, rate: p.rate ?? null, currency: p.currency ?? null })));
      setMonthlyStats([]);
      setProjectStats([]);
      setTasks([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const q = search.toLowerCase();
  const matchingProjectIds = new Set(
    projects.filter((p) => p.name.toLowerCase().includes(q)).map((p) => p.id)
  );
  const matchingProjectClientIds = new Set(
    projects.filter((p) => p.name.toLowerCase().includes(q) && p.client_id).map((p) => p.client_id!)
  );
  const filteredTasks = tasks.filter((t) => t.name.toLowerCase().includes(q));

  const filtered = clients.filter((c) => {
    if (!q) return true;
    // Direct client match
    if (c.name.toLowerCase().includes(q) || (c.nif ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)) return true;
    // Client has a matching project
    if (matchingProjectClientIds.has(c.id)) return true;
    return false;
  });

  const getClientStats = (id: string) => monthlyStats.find((s) => s.clientId === id);
  const getProjectStats = (id: string) => projectStats.find((s) => s.projectId === id);
  const getClientProjects = (clientId: string) => projects.filter((p) => p.client_id === clientId);

  // --- CRUD handlers ---
  const handleAddClientClick = () => {
    if (isFree && clients.length >= 2) {
      setPaywallMessage("You've reached the 2-client limit on the free plan. Upgrade to Pro for unlimited clients.");
      setPaywallOpen(true);
      return;
    }
    setEditingClient(null);
    setClientFormOpen(true);
  };

  const handleSaveClient = async (data: any) => {
    if (user) {
      if (editingClient) {
        await supabase.from("clients").update({
          name: data.name, email: data.email || null, nif: data.nif || null,
          currency: data.currency, default_rate: data.default_rate ? parseFloat(data.default_rate) : null,
        }).eq("id", editingClient.id);
        toast.success("Client updated.");
      } else {
        await supabase.from("clients").insert({
          name: data.name, email: data.email || null, nif: data.nif || null,
          currency: data.currency, default_rate: data.default_rate ? parseFloat(data.default_rate) : null,
          user_id: user.id,
        });
        toast.success("Client added.");
      }
    } else {
      const id = editingClient?.id ?? `local-${Date.now()}`;
      saveAnonymousClient({ id, name: data.name, email: data.email, nif: data.nif, currency: data.currency, default_rate: data.default_rate ? parseFloat(data.default_rate) : null });
      toast.success(editingClient ? "Client updated." : "Client added.");
    }
    setClientFormOpen(false);
    loadData();
  };

  const handleDeleteClient = async () => {
    if (!deleteClientId) return;
    if (user) {
      // Nullify references
      await supabase.from("time_entries").update({ client_id: null }).eq("client_id", deleteClientId);
      await supabase.from("projects").delete().eq("client_id", deleteClientId);
      await supabase.from("clients").delete().eq("id", deleteClientId);
    }
    setDeleteClientId(null);
    setExpandedId(null);
    toast.success("Client deleted.");
    loadData();
  };

  const handleAddProjectClick = (client: Client) => {
    if (isFree && projects.length >= 3) {
      setPaywallMessage("You've reached the 3-project limit on the free plan. Upgrade to Pro for unlimited projects.");
      setPaywallOpen(true);
      return;
    }
    setEditingProject(null);
    setProjectParentClient(client);
    setProjectFormOpen(true);
  };

  const handleSaveProject = async (data: any) => {
    if (!projectParentClient) return;
    if (user) {
      if (editingProject) {
        await supabase.from("projects").update({
          name: data.name, rate: data.rate ? parseFloat(data.rate) : null, currency: data.currency,
        }).eq("id", editingProject.id);
        toast.success("Project updated.");
      } else {
        await supabase.from("projects").insert({
          name: data.name, client_id: projectParentClient.id,
          rate: data.rate ? parseFloat(data.rate) : null, currency: data.currency,
          user_id: user.id,
        });
        toast.success("Project added.");
      }
    } else {
      const id = editingProject?.id ?? `local-${Date.now()}`;
      saveAnonymousProject({ id, name: data.name, client_id: projectParentClient.id, rate: data.rate ? parseFloat(data.rate) : null, currency: data.currency });
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
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search clients, projects, tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Add Client */}
      <Button
        variant="outline"
        className="w-full mb-4 gap-2 rounded-xl"
        onClick={handleAddClientClick}
      >
        <Plus className="w-4 h-4" /> Add Client
      </Button>

      {/* Empty state */}
      {clients.length === 0 && !search && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Briefcase className="w-12 h-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground text-sm text-center">
            No clients yet.<br />Add your first client to start tracking billable work.
          </p>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 px-6 font-bold" onClick={handleAddClientClick}>
            <Plus className="w-4 h-4 mr-2" /> Add Client
          </Button>
          <SignInLink />
        </div>
      )}

      {/* No search results */}
      {search && filtered.length === 0 && filteredTasks.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No results match your search.</p>
      )}

      {/* Client cards */}
      <div className="space-y-3">
        {filtered.map((client) => {
          const expanded = expandedId === client.id;
          const stats = getClientStats(client.id);
          const clientProjects = getClientProjects(client.id);

          return (
            <div
              key={client.id}
              className="rounded-xl border border-border bg-card overflow-hidden transition-all"
            >
              {/* Collapsed header */}
              <button
                className="flex items-center w-full px-4 py-3 text-left gap-3"
                onClick={() => setExpandedId(expanded ? null : client.id)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getAvatarColor(client.name)}`}>
                  {getInitial(client.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {clientProjects.length} {clientProjects.length === 1 ? "project" : "projects"}
                    {stats ? ` · ${stats.hours.toFixed(1)}h this month` : ""}
                    {stats && stats.value > 0 ? ` · ${sym(client.currency)}${stats.value.toFixed(0)}` : ""}
                  </p>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>

              {/* Expanded content */}
              {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  {/* Contact info */}
                  {client.email && (
                    <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                      <Mail className="w-3.5 h-3.5" /> {client.email}
                    </a>
                  )}
                  {client.nif && (
                    <button
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => { navigator.clipboard.writeText(client.nif!); toast.success("NIF copied."); }}
                    >
                      <Hash className="w-3.5 h-3.5" /> NIF: {client.nif}
                    </button>
                  )}
                  {client.default_rate != null && (
                    <p className="text-sm text-muted-foreground">
                      Default rate: {sym(client.currency)}{client.default_rate}/hour
                    </p>
                  )}

                  {/* Projects */}
                  {clientProjects.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Projects</p>
                      <div className="space-y-2">
                        {clientProjects.map((project) => {
                          const ps = getProjectStats(project.id);
                          const totalClientHours = stats?.hours || 1;
                          const pct = ps ? Math.round((ps.hours / totalClientHours) * 100) : 0;
                          const rateDisplay = project.rate
                            ? `${sym(project.currency ?? client.currency)}${project.rate}/hour`
                            : client.default_rate
                              ? `Inherits ${sym(client.currency)}${client.default_rate}/hour`
                              : "No rate";

                          return (
                            <div
                              key={project.id}
                              className="p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setEditingProject(project);
                                setProjectParentClient(client);
                                setProjectFormOpen(true);
                              }}
                            >
                              <p className="font-medium text-sm text-foreground">{project.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {rateDisplay}
                                {ps ? ` · ${ps.hours.toFixed(1)}h` : ""}
                                {ps && ps.value > 0 ? ` · ${sym(project.currency ?? client.currency)}${ps.value.toFixed(0)}` : ""}
                                {ps ? ` · ${pct}%` : ""}
                              </p>
                              {ps && (
                                <div className="w-full h-1 rounded-full bg-muted mt-2 overflow-hidden">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Button variant="outline" size="sm" className="gap-1 rounded-lg" onClick={() => handleAddProjectClick(client)}>
                    <Plus className="w-3.5 h-3.5" /> Add Project
                  </Button>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 rounded-lg flex-1"
                      onClick={() => { setEditingClient(client); setClientFormOpen(true); }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit client
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 rounded-lg flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setDeleteClientId(client.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tasks section */}
      {((!search && tasks.length > 0) || (search && filteredTasks.length > 0) || !search) && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <button
              className="flex items-center gap-1"
              onClick={() => setTasksExpanded(!tasksExpanded)}
            >
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tasks ({search ? filteredTasks.length : tasks.length})
              </h3>
              {tasksExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            {!search && (
              <button
                className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                onClick={() => { setAddingTask(true); setTasksExpanded(true); setNewTaskName(""); }}
              >
                <Plus className="w-3.5 h-3.5" /> Add task
              </button>
            )}
          </div>
          {tasksExpanded && (
            <div className="space-y-1">
              {/* Inline add */}
              {addingTask && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary bg-card">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Input
                    autoFocus
                    className="h-7 text-sm border-none shadow-none p-0 focus-visible:ring-0"
                    placeholder="Task name..."
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); if (e.key === "Escape") setAddingTask(false); }}
                  />
                  <button onClick={handleAddTask} className="text-primary hover:text-primary/80 shrink-0">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setAddingTask(false)} className="text-muted-foreground hover:text-foreground shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {(search ? filteredTasks : tasks).map((task) => {
                const count = taskEntryCounts[task.id] || 0;
                const isEditing = editingTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card gap-2"
                  >
                    {isEditing ? (
                      <>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <Input
                          autoFocus
                          className="h-7 text-sm border-none shadow-none p-0 focus-visible:ring-0 flex-1"
                          value={editingTaskName}
                          onChange={(e) => setEditingTaskName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameTask(task.id); if (e.key === "Escape") setEditingTaskId(null); }}
                        />
                        <button onClick={() => handleRenameTask(task.id)} className="text-primary hover:text-primary/80 shrink-0">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingTaskId(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                          onClick={() => { setEditingTaskId(task.id); setEditingTaskName(task.name); }}
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm text-foreground truncate">{task.name}</span>
                        </button>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {count} {count === 1 ? "entry" : "entries"}
                        </span>
                        {count === 0 && (
                          <button
                            onClick={() => setDeleteTaskId(task.id)}
                            className="text-destructive hover:text-destructive/80 shrink-0 ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Client Form Modal */}
      <ClientFormModal
        open={clientFormOpen}
        onOpenChange={setClientFormOpen}
        onSave={handleSaveClient}
        initial={editingClient ? {
          name: editingClient.name, email: editingClient.email ?? "",
          nif: editingClient.nif ?? "", currency: editingClient.currency ?? "EUR",
          default_rate: editingClient.default_rate != null ? String(editingClient.default_rate) : "",
          rate_unit: "hour",
        } : null}
        title={editingClient ? "Edit Client" : "Add Client"}
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
            <AlertDialogDescription>This will not delete associated time entries. They will show client as 'Removed'.</AlertDialogDescription>
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
