import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import CreatableCombobox, { ComboboxItem } from "@/components/CreatableCombobox";
import { formatDuration } from "@/hooks/useTimer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  getAnonymousClients, saveAnonymousClient,
  getAnonymousProjects, saveAnonymousProject,
  getAnonymousTasks, saveAnonymousTask,
} from "@/lib/anonymous-store";

export interface SessionData {
  durationMinutes: number;
  breakMinutes: number;
  startedAt: string | null;
  entryType: string;
}

export interface AssignmentResult {
  clientId: string | null;
  projectId: string | null;
  taskName: string;
  notes: string;
  tags: string[];
  billable: boolean;
  rateAmount: number | null;
}

interface AssignmentModalProps {
  open: boolean;
  session: SessionData | null;
  onSave: (session: SessionData, assignment: AssignmentResult) => void;
  onSkip: (session: SessionData) => void;
}

const AssignmentModal = ({ open, session, onSave, onSkip }: AssignmentModalProps) => {
  const { user } = useAuth();
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [billable, setBillable] = useState(true);
  const [rateAmount, setRateAmount] = useState("");

  const [clients, setClients] = useState<ComboboxItem[]>([]);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; client_id: string | null }[]>([]);
  const [tasks, setTasks] = useState<ComboboxItem[]>([]);

  const loadData = useCallback(async () => {
    if (user) {
      const [{ data: c }, { data: p }, { data: t }] = await Promise.all([
        supabase.from("clients").select("id, name").eq("user_id", user.id),
        supabase.from("projects").select("id, name, client_id").eq("user_id", user.id),
        supabase.from("tasks").select("id, name").eq("user_id", user.id),
      ]);
      setClients((c ?? []).map((x) => ({ id: x.id, name: x.name })));
      setAllProjects(p ?? []);
      setTasks((t ?? []).map((x) => ({ id: x.id, name: x.name })));
    } else {
      const ac = getAnonymousClients();
      setClients(ac.map((c: any) => ({ id: c.id, name: c.name })));
      const ap = getAnonymousProjects();
      setAllProjects(ap.map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id ?? null })));
      const at = getAnonymousTasks();
      setTasks(at.map((t: any) => ({ id: t.id, name: t.name })));
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setClientId(""); setClientName("");
    setProjectId(""); setProjectName("");
    setTaskName(""); setNotes(""); setTagsInput("");
    setBillable(true); setRateAmount("");
    loadData();
  }, [open, loadData]);

  if (!session) return null;

  // Filtered projects for selected client
  const filteredProjects: ComboboxItem[] = clientId
    ? allProjects.filter((p) => p.client_id === clientId).map((p) => ({ id: p.id, name: p.name }))
    : allProjects.map((p) => ({ id: p.id, name: p.name }));

  // --- Create handlers ---
  const handleCreateClient = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      const { data, error } = await supabase.from("clients").insert({ name, user_id: user.id }).select("id, name").single();
      if (error || !data) return null;
      setClients((prev) => [...prev, { id: data.id, name: data.name }]);
      return { id: data.id, name: data.name };
    } else {
      const id = `local-${Date.now()}`;
      saveAnonymousClient({ id, name });
      setClients((prev) => [...prev, { id, name }]);
      return { id, name };
    }
  };

  const handleCreateProject = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      const insert: any = { name, user_id: user.id };
      if (clientId) insert.client_id = clientId;
      const { data, error } = await supabase.from("projects").insert(insert).select("id, name, client_id").single();
      if (error || !data) return null;
      setAllProjects((prev) => [...prev, { id: data.id, name: data.name, client_id: data.client_id }]);
      return { id: data.id, name: data.name };
    } else {
      const id = `local-${Date.now()}`;
      const proj = { id, name, client_id: clientId || null };
      saveAnonymousProject(proj);
      setAllProjects((prev) => [...prev, proj]);
      return { id, name };
    }
  };

  const handleCreateTask = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
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

  const handleSave = () => {
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave(session, {
      clientId: clientId || null,
      projectId: projectId || null,
      taskName,
      notes,
      tags,
      billable,
      rateAmount: rateAmount ? parseFloat(rateAmount) : null,
    });
  };

  const handleSkipOrDismiss = () => onSkip(session);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkipOrDismiss(); }}>
      <DialogContent className="max-w-[400px] rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {session.entryType === "shift" ? "Shift Complete" : "Session Complete"}
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

        <div className="space-y-3">
          {/* Client */}
          <div>
            <Label>Client</Label>
            <CreatableCombobox
              items={clients}
              value={clientId}
              displayValue={clientName}
              placeholder="Select client (optional)"
              onSelect={(id, name) => {
                setClientId(id);
                setClientName(name);
                // Reset project when client changes
                setProjectId("");
                setProjectName("");
              }}
              onCreate={async (name) => {
                const created = await handleCreateClient(name);
                if (created) {
                  setClientId(created.id);
                  setClientName(created.name);
                  setProjectId("");
                  setProjectName("");
                }
                return created;
              }}
            />
          </div>

          {/* Billable toggle + rate */}
          <div className="flex items-center justify-between">
            <Label>Billable</Label>
            <Switch checked={billable} onCheckedChange={setBillable} />
          </div>
          {billable && (
            <div>
              <Label>Rate (per hour)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
              />
            </div>
          )}

          {/* Project */}
          <div>
            <Label>Project</Label>
            <CreatableCombobox
              items={filteredProjects}
              value={projectId}
              displayValue={projectName}
              placeholder="Select project (optional)"
              onSelect={(id, name) => {
                setProjectId(id);
                setProjectName(name);
              }}
              onCreate={async (name) => {
                const created = await handleCreateProject(name);
                if (created) {
                  setProjectId(created.id);
                  setProjectName(created.name);
                }
                return created;
              }}
            />
          </div>

          {/* Task */}
          <div>
            <Label>Task</Label>
            <CreatableCombobox
              items={tasks}
              value={tasks.find((t) => t.name === taskName)?.id ?? ""}
              displayValue={taskName}
              placeholder="What were you working on?"
              onSelect={(_id, name) => setTaskName(name)}
              onCreate={async (name) => {
                const created = await handleCreateTask(name);
                if (created) setTaskName(created.name);
                return created;
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea
              placeholder="Add notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <Input
              placeholder="Comma-separated tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1 rounded-[28px] h-12 font-bold"
            onClick={handleSkipOrDismiss}
          >
            Skip
          </Button>
          <Button
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold"
            onClick={handleSave}
          >
            Save Entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentModal;
