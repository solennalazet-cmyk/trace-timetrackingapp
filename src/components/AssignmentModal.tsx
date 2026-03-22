import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CreatableCombobox, { ComboboxItem } from "@/components/CreatableCombobox";
import TagsInput from "@/components/TagsInput";
import { formatDuration } from "@/hooks/useTimer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  getAnonymousClients, saveAnonymousClient,
  getAnonymousProjects, saveAnonymousProject,
  getAnonymousTasks, saveAnonymousTask,
} from "@/lib/anonymous-store";
import { toast } from "sonner";

export interface SessionData {
  durationMinutes: number;
  breakMinutes: number;
  startedAt: string | null;
  entryType: string;
}

export interface AssignmentResult {
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  taskName: string;
  notes: string;
  tags: string[];
  billable: boolean;
  rateAmount: number | null;
  rateCurrency: string;
  rateUnit: string;
  billableValue: number | null;
}

// Existing entry for edit mode
export interface ExistingEntry {
  id: string;
  client_id: string | null;
  project_id: string | null;
  task_id: string | null;
  notes: string | null;
  tags: string[] | null;
  billable: boolean | null;
  rate_amount: number | null;
  rate_currency: string | null;
  rate_unit: string | null;
  duration_minutes: number;
  break_minutes: number | null;
  entry_type: string | null;
  entry_date: string | null;
}

interface AssignmentModalProps {
  open: boolean;
  session: SessionData | null;
  existingEntry?: ExistingEntry | null;
  onSave: (session: SessionData, assignment: AssignmentResult) => void;
  onSkip: (session: SessionData) => void;
}

interface ClientFull {
  id: string;
  name: string;
  default_rate: number | null;
  currency: string | null;
}

interface ProjectFull {
  id: string;
  name: string;
  client_id: string | null;
  rate: number | null;
  currency: string | null;
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "BRL", "CAD", "AUD"];
const RATE_UNITS = [
  { value: "hour", label: "Per hour" },
  { value: "word", label: "Per word" },
  { value: "project", label: "Per project" },
];

const AssignmentModal = ({ open, session, existingEntry, onSave, onSkip }: AssignmentModalProps) => {
  const { user } = useAuth();
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [taskId, setTaskId] = useState("");
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [billable, setBillable] = useState(true);
  const [rateAmount, setRateAmount] = useState("");
  const [rateCurrency, setRateCurrency] = useState("EUR");
  const [rateUnit, setRateUnit] = useState("hour");

  const [clientsFull, setClientsFull] = useState<ClientFull[]>([]);
  const [allProjectsFull, setAllProjectsFull] = useState<ProjectFull[]>([]);
  const [tasks, setTasks] = useState<ComboboxItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const clients: ComboboxItem[] = clientsFull.map((c) => ({ id: c.id, name: c.name }));
  const filteredProjects: ComboboxItem[] = clientId
    ? allProjectsFull.filter((p) => p.client_id === clientId).map((p) => ({ id: p.id, name: p.name }))
    : allProjectsFull.map((p) => ({ id: p.id, name: p.name }));

  const loadData = useCallback(async () => {
    if (user) {
      const [{ data: c }, { data: p }, { data: t }] = await Promise.all([
        supabase.from("clients").select("id, name, default_rate, currency").eq("user_id", user.id),
        supabase.from("projects").select("id, name, client_id, rate, currency").eq("user_id", user.id),
        supabase.from("tasks").select("id, name").eq("user_id", user.id),
      ]);
      setClientsFull((c ?? []) as ClientFull[]);
      setAllProjectsFull((p ?? []) as ProjectFull[]);
      setTasks((t ?? []).map((x) => ({ id: x.id, name: x.name })));

      // Load all previously-used tags for autocomplete
      const { data: tagEntries } = await supabase
        .from("time_entries")
        .select("tags")
        .eq("user_id", user.id)
        .not("tags", "is", null)
        .is("deleted_at", null);
      const tagSet = new Set<string>();
      tagEntries?.forEach((e) => e.tags?.forEach((t: string) => tagSet.add(t)));
      setAllTags(Array.from(tagSet).sort());
    } else {
      const ac = getAnonymousClients();
      setClientsFull(ac.map((c: any) => ({ id: c.id, name: c.name, default_rate: c.default_rate ?? null, currency: c.currency ?? null })));
      const ap = getAnonymousProjects();
      setAllProjectsFull(ap.map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id ?? null, rate: p.rate ?? null, currency: p.currency ?? null })));
      const at = getAnonymousTasks();
      setTasks(at.map((t: any) => ({ id: t.id, name: t.name })));
      setAllTags([]);
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;

    if (existingEntry) {
      // Edit mode — pre-fill
      setClientId(existingEntry.client_id ?? "");
      setProjectId(existingEntry.project_id ?? "");
      setTaskId(existingEntry.task_id ?? "");
      setNotes(existingEntry.notes ?? "");
      setTags(existingEntry.tags ?? []);
      setBillable(existingEntry.billable ?? true);
      setRateAmount(existingEntry.rate_amount != null ? String(existingEntry.rate_amount) : "");
      setRateCurrency(existingEntry.rate_currency ?? "EUR");
      setRateUnit(existingEntry.rate_unit ?? "hour");
    } else {
      setClientId(""); setClientName("");
      setProjectId(""); setProjectName("");
      setTaskId(""); setTaskName("");
      setNotes(""); setTags([]);
      setBillable(true); setRateAmount("");
      setRateCurrency("EUR"); setRateUnit("hour");
    }

    loadData();
  }, [open, loadData, existingEntry]);

  // After data loads, resolve names for edit mode
  useEffect(() => {
    if (existingEntry && clientId) {
      const c = clientsFull.find((x) => x.id === clientId);
      if (c) setClientName(c.name);
    }
    if (existingEntry && projectId) {
      const p = allProjectsFull.find((x) => x.id === projectId);
      if (p) setProjectName(p.name);
    }
    if (existingEntry && taskId) {
      const t = tasks.find((x) => x.id === taskId);
      if (t) setTaskName(t.name);
    }
  }, [clientsFull, allProjectsFull, tasks, existingEntry, clientId, projectId, taskId]);

  // Rate resolution when client/project changes
  useEffect(() => {
    if (existingEntry) return; // Don't override on edit
    if (!user) {
      // Local fallback for anonymous
      const sp = allProjectsFull.find((p) => p.id === projectId);
      const sc = clientsFull.find((c) => c.id === clientId);
      if (sp?.rate) { setRateAmount(String(sp.rate)); setRateCurrency(sp.currency ?? sc?.currency ?? "EUR"); }
      else if (sc?.default_rate) { setRateAmount(String(sc.default_rate)); setRateCurrency(sc.currency ?? "EUR"); }
      return;
    }
    if (!clientId && !projectId) return;
    resolveRate(clientId || null, projectId || null, user.id).then((r) => {
      if (r.amount != null) { setRateAmount(String(r.amount)); setRateCurrency(r.currency); }
    });
  }, [clientId, projectId, user, existingEntry]);

  if (!session) return null;

  const calcBillableValue = (): number | null => {
    const amount = parseFloat(rateAmount);
    if (!billable || !amount) return null;
    if (rateUnit === "hour") return (session.durationMinutes / 60) * amount;
    if (rateUnit === "project") return amount;
    if (rateUnit === "word") return amount; // stored, not auto-calculated
    return null;
  };

  // --- Create handlers ---
  const handleCreateClient = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      const { data, error } = await supabase.from("clients").insert({ name, user_id: user.id }).select("id, name, default_rate, currency").single();
      if (error || !data) return null;
      setClientsFull((prev) => [...prev, data as ClientFull]);
      return { id: data.id, name: data.name };
    } else {
      const id = `local-${Date.now()}`;
      saveAnonymousClient({ id, name, default_rate: null, currency: "EUR" });
      setClientsFull((prev) => [...prev, { id, name, default_rate: null, currency: null }]);
      return { id, name };
    }
  };

  const handleCreateProject = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      // Check for existing match first
      let query = supabase.from("projects").select("id, name, client_id, rate, currency")
        .eq("user_id", user.id).ilike("name", name);
      if (clientId) query = query.eq("client_id", clientId);
      const { data: existing } = await query.maybeSingle();
      if (existing) {
        setAllProjectsFull((prev) => prev.some((p) => p.id === existing.id) ? prev : [...prev, existing as ProjectFull]);
        return { id: existing.id, name: existing.name };
      }
      const insert: any = { name, user_id: user.id };
      if (clientId) insert.client_id = clientId;
      const { data, error } = await supabase.from("projects").insert(insert).select("id, name, client_id, rate, currency").single();
      if (error || !data) return null;
      setAllProjectsFull((prev) => [...prev, data as ProjectFull]);
      return { id: data.id, name: data.name };
    } else {
      const id = `local-${Date.now()}`;
      const proj = { id, name, client_id: clientId || null, rate: null, currency: null };
      saveAnonymousProject(proj);
      setAllProjectsFull((prev) => [...prev, proj]);
      return { id, name };
    }
  };

  const handleCreateTask = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      // Check for existing match first
      const { data: existing } = await supabase.from("tasks").select("id, name")
        .eq("user_id", user.id).ilike("name", name).maybeSingle();
      if (existing) {
        setTasks((prev) => prev.some((t) => t.id === existing.id) ? prev : [...prev, existing]);
        return { id: existing.id, name: existing.name };
      }
      const { data, error } = await supabase.from("tasks").insert({ name, user_id: user.id }).select("id, name").single();
      if (error || !data) return null;
      setTasks((prev) => [...prev, { id: data.id, name: data.name }]);
      return { id: data.id, name: data.name };
    } else {
      const id = `local-${Date.now()}`;
      saveAnonymousTask({ id, name });
      setTasks((prev) => [...prev, { id, name }]);
      return { id, name };
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const billableValue = calcBillableValue();

      // Update client default_rate if changed
      if (billable && rateAmount && clientId && user) {
        const amount = parseFloat(rateAmount);
        const selectedClient = clientsFull.find((c) => c.id === clientId);
        if (selectedClient && selectedClient.default_rate !== amount) {
          await supabase.from("clients").update({ default_rate: amount, currency: rateCurrency }).eq("id", clientId);
        }
      }

      onSave(session, {
        clientId: clientId || null,
        projectId: projectId || null,
        taskId: taskId || null,
        taskName,
        notes,
        tags,
        billable,
        rateAmount: rateAmount ? parseFloat(rateAmount) : null,
        rateCurrency,
        rateUnit,
        billableValue,
      });
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Something went wrong. Your session is safe — try again.");
      setSaving(false);
      return; // Don't close modal
    }
    setSaving(false);
  };

  const handleSkipOrDismiss = () => onSkip(session);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkipOrDismiss(); }}>
      <DialogContent className="max-w-[400px] rounded-t-2xl sm:rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle>
            {existingEntry
              ? "Edit Entry"
              : session.entryType === "shift"
                ? "Shift Complete"
                : "Session Complete"}
          </DialogTitle>
        </DialogHeader>

        {/* Duration summary */}
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 mb-2">
          <div className="text-center">
            <p className="font-mono text-2xl font-bold text-timer-display">
              {formatDuration(session.durationMinutes)}
            </p>
            <p className="text-[11px] text-muted-foreground">Duration</p>
          </div>
          {session.breakMinutes > 0 && (
            <>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="font-mono text-lg font-semibold text-muted-foreground">
                  {formatDuration(session.breakMinutes)}
                </p>
                <p className="text-[11px] text-muted-foreground">Break</p>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3 text-foreground">
          {/* Client */}
          <div>
            <Label className="text-foreground">Client</Label>
            <CreatableCombobox
              items={clients}
              value={clientId}
              displayValue={clientName}
              placeholder="Select client (optional)"
              onSelect={(id, name) => {
                setClientId(id);
                setClientName(name);
                setProjectId("");
                setProjectName("");
              }}
              onCreate={async (name) => {
                const created = await handleCreateClient(name);
                if (created) { setClientId(created.id); setClientName(created.name); setProjectId(""); setProjectName(""); }
                return created;
              }}
            />
          </div>

          {/* Billable toggle + rate */}
          <div className="flex items-center justify-between">
            <Label className="text-foreground">Billable</Label>
            <Switch checked={billable} onCheckedChange={setBillable} />
          </div>
          {billable && (
            <div className="flex gap-2">
              <div className="w-20">
                <Select value={rateCurrency} onValueChange={setRateCurrency}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={rateAmount}
                  onChange={(e) => setRateAmount(e.target.value)}
                />
              </div>
              <div className="w-28">
                <Select value={rateUnit} onValueChange={setRateUnit}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Project */}
          <div>
            <Label className="text-foreground">Project</Label>
            <CreatableCombobox
              items={filteredProjects}
              value={projectId}
              displayValue={projectName}
              placeholder="Select project (optional)"
              onSelect={(id, name) => { setProjectId(id); setProjectName(name); }}
              onCreate={async (name) => {
                const created = await handleCreateProject(name);
                if (created) { setProjectId(created.id); setProjectName(created.name); }
                return created;
              }}
            />
          </div>

          {/* Task */}
          <div>
            <Label className="text-foreground">Task</Label>
            <CreatableCombobox
              items={tasks}
              value={taskId}
              displayValue={taskName}
              placeholder="What were you working on?"
              onSelect={(id, name) => { setTaskId(id); setTaskName(name); }}
              onCreate={async (name) => {
                const created = await handleCreateTask(name);
                if (created) { setTaskId(created.id); setTaskName(created.name); }
                return created;
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-foreground">Notes</Label>
            <Textarea
              placeholder="Optional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Tags */}
          <div>
            <Label className="text-foreground">Tags</Label>
            <TagsInput
              value={tags}
              onChange={setTags}
              suggestions={allTags}
            />
          </div>
        </div>

        <DialogFooter>
          {!existingEntry && (
            <Button
              variant="outline"
              className="flex-1 rounded-[28px] h-12 font-bold"
              onClick={handleSkipOrDismiss}
            >
              Skip
            </Button>
          )}
          <Button
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold"
            onClick={handleSave}
            disabled={saving}
          >
            {existingEntry ? "Update Entry" : "Save Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentModal;
