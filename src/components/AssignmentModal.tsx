import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/hooks/useTimer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getAnonymousClients, getAnonymousProjects } from "@/lib/anonymous-store";

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
  const [clientId, setClientId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [billable, setBillable] = useState(true);
  const [rateAmount, setRateAmount] = useState("");

  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    // Reset fields
    setClientId("");
    setProjectId("");
    setTaskName("");
    setNotes("");
    setTagsInput("");
    setBillable(true);
    setRateAmount("");

    // Load clients & projects
    if (user) {
      supabase.from("clients").select("id, name").eq("user_id", user.id).then(({ data }) => {
        setClients(data ?? []);
      });
      supabase.from("projects").select("id, name").eq("user_id", user.id).then(({ data }) => {
        setProjects(data ?? []);
      });
    } else {
      setClients(getAnonymousClients().map((c: any, i: number) => ({ id: `local-${i}`, name: c.name })));
      setProjects(getAnonymousProjects().map((p: any, i: number) => ({ id: `local-${i}`, name: p.name })));
    }
  }, [open, user]);

  if (!session) return null;

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

  const handleSkipOrDismiss = () => {
    onSkip(session);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleSkipOrDismiss();
      }}
    >
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
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client (optional)" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project (optional)" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task */}
          <div>
            <Label>Task</Label>
            <Input
              placeholder="What were you working on?"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
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
