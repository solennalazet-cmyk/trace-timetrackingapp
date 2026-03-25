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
import ScrollPicker from "@/components/ScrollPicker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  getAnonymousClients, saveAnonymousClient,
  getAnonymousProjects, saveAnonymousProject,
  getAnonymousTasks, saveAnonymousTask,
  saveAnonymousEntry,
} from "@/lib/anonymous-store";
import { toast } from "sonner";
import { resolveRate } from "@/lib/resolve-rate";

interface CallLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface ClientFull { id: string; name: string; default_rate: number | null; currency: string | null; }
interface ProjectFull { id: string; name: string; client_id: string | null; rate: number | null; currency: string | null; }

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "BRL", "CAD", "AUD"];
const RATE_UNITS = [
  { value: "hour", label: "Per hour" },
  { value: "word", label: "Per word" },
  { value: "project", label: "Per project" },
];

const CallLogModal = ({ open, onOpenChange, onSaved }: CallLogModalProps) => {
  const { user } = useAuth();

  const [pickerHours, setPickerHours] = useState(0);
  const [pickerMinutes, setPickerMinutes] = useState(15);
  const [pickerSeconds, setPickerSeconds] = useState(0);

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [taskId, setTaskId] = useState("");
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(true);
  const [rateAmount, setRateAmount] = useState("");
  const [rateCurrency, setRateCurrency] = useState("EUR");
  const [rateUnit, setRateUnit] = useState("hour");

  const [clientsFull, setClientsFull] = useState<ClientFull[]>([]);
  const [allProjectsFull, setAllProjectsFull] = useState<ProjectFull[]>([]);
  const [tasks, setTasks] = useState<ComboboxItem[]>([]);
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
    } else {
      setClientsFull(getAnonymousClients().map((c: any) => ({ id: c.id, name: c.name, default_rate: c.default_rate ?? null, currency: c.currency ?? null })));
      setAllProjectsFull(getAnonymousProjects().map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id ?? null, rate: p.rate ?? null, currency: p.currency ?? null })));
      setTasks(getAnonymousTasks().map((t: any) => ({ id: t.id, name: t.name })));
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setDurationMinutes(15); setDirectInput(false); setDirectHours("0"); setDirectMins("15");
    setClientId(""); setClientName(""); setProjectId(""); setProjectName("");
    setTaskId(""); setTaskName(""); setNotes("");
    setBillable(true); setRateAmount(""); setRateCurrency("EUR"); setRateUnit("hour");
    loadData();
  }, [open, loadData]);

  // Rate resolution
  useEffect(() => {
    if (!user) {
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
  }, [clientId, projectId, user]);

  // Draw dial
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 180;
    canvas.width = size * 2; canvas.height = size * 2;
    canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
    ctx.scale(2, 2);
    const cx = size / 2, cy = size / 2, r = 70;

    ctx.clearRect(0, 0, size, size);

    // Background ring
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "hsl(240 5% 85%)"; ctx.lineWidth = 6; ctx.stroke();

    // Active arc
    const angle = (durationMinutes / 120) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, angle);
    ctx.strokeStyle = "hsl(var(--primary))"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.stroke();

    // Handle
    const hx = cx + r * Math.cos(angle);
    const hy = cy + r * Math.sin(angle);
    ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2);
    ctx.fillStyle = "hsl(var(--primary))"; ctx.fill();
    ctx.strokeStyle = "hsl(var(--primary-foreground))"; ctx.lineWidth = 2; ctx.stroke();
  }, [durationMinutes]);

  const handleDialInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    const mins = Math.round((angle / (Math.PI * 2)) * 120);
    const clamped = Math.max(1, Math.min(120, mins));
    setDurationMinutes(clamped);
    setDirectHours(String(Math.floor(clamped / 60)));
    setDirectMins(String(clamped % 60));
  };

  const handleCreateClient = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      const { data } = await supabase.from("clients").insert({ name, user_id: user.id }).select("id, name, default_rate, currency").single();
      if (!data) return null; setClientsFull((prev) => [...prev, data as ClientFull]); return { id: data.id, name: data.name };
    }
    const id = `local-${Date.now()}`; saveAnonymousClient({ id, name, default_rate: null, currency: "EUR" });
    setClientsFull((prev) => [...prev, { id, name, default_rate: null, currency: null }]); return { id, name };
  };

  const handleCreateProject = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      let query = supabase.from("projects").select("id, name, client_id, rate, currency")
        .eq("user_id", user.id).ilike("name", name);
      if (clientId) query = query.eq("client_id", clientId);
      const { data: existing } = await query.maybeSingle();
      if (existing) {
        setAllProjectsFull((prev) => prev.some((p) => p.id === existing.id) ? prev : [...prev, existing as ProjectFull]);
        return { id: existing.id, name: existing.name };
      }
      const insert: any = { name, user_id: user.id }; if (clientId) insert.client_id = clientId;
      const { data } = await supabase.from("projects").insert(insert).select("id, name, client_id, rate, currency").single();
      if (!data) return null; setAllProjectsFull((prev) => [...prev, data as ProjectFull]); return { id: data.id, name: data.name };
    }
    const id = `local-${Date.now()}`; const proj = { id, name, client_id: clientId || null, rate: null, currency: null };
    saveAnonymousProject(proj); setAllProjectsFull((prev) => [...prev, proj]); return { id, name };
  };

  const handleCreateTask = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      const { data: existing } = await supabase.from("tasks").select("id, name")
        .eq("user_id", user.id).ilike("name", name).maybeSingle();
      if (existing) {
        setTasks((prev) => prev.some((t) => t.id === existing.id) ? prev : [...prev, existing]);
        return { id: existing.id, name: existing.name };
      }
      const { data } = await supabase.from("tasks").insert({ name, user_id: user.id }).select("id, name").single();
      if (!data) return null; setTasks((prev) => [...prev, { id: data.id, name: data.name }]); return { id: data.id, name: data.name };
    }
    const id = `local-${Date.now()}`; saveAnonymousTask({ id, name });
    setTasks((prev) => [...prev, { id, name }]); return { id, name };
  };

  const handleSave = async () => {
    if (durationMinutes <= 0 || saving) return;
    setSaving(true);
    try {
      const rateNum = rateAmount ? parseFloat(rateAmount) : null;
      let billableValue: number | null = null;
      if (billable && rateNum) {
        if (rateUnit === "hour") billableValue = (durationMinutes / 60) * rateNum;
        else billableValue = rateNum;
      }

      const entry: any = {
        duration_minutes: durationMinutes, break_minutes: 0,
        entry_type: "call", entry_date: new Date().toISOString().split("T")[0],
        billable, billing_status: "unbilled",
        client_id: clientId || null, project_id: projectId || null,
        notes: notes || null, tags: null,
        rate_amount: rateNum, rate_currency: rateCurrency,
        rate_unit: rateNum ? rateUnit : null, billable_value: billableValue,
      };

      if (user) {
        const { error } = await supabase.from("time_entries").insert({ ...entry, user_id: user.id });
        if (error) throw error;
      } else {
        saveAnonymousEntry(entry);
      }

      toast.success("Call logged.");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Something went wrong. Try again.");
    }
    setSaving(false);
  };

  const displayH = Math.floor(durationMinutes / 60);
  const displayM = durationMinutes % 60;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-t-2xl sm:rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle>Log Call</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Circular dial */}
          <div className="flex flex-col items-center gap-2">
            <canvas
              ref={canvasRef}
              className="cursor-pointer"
              onMouseDown={(e) => { setDragging(true); handleDialInteraction(e); }}
              onMouseMove={(e) => { if (dragging) handleDialInteraction(e); }}
              onMouseUp={() => setDragging(false)}
              onMouseLeave={() => setDragging(false)}
              onTouchStart={(e) => { setDragging(true); handleDialInteraction(e); }}
              onTouchMove={(e) => { if (dragging) handleDialInteraction(e); }}
              onTouchEnd={() => setDragging(false)}
            />
            {directInput ? (
              <div className="flex items-center gap-1">
                <Input type="number" className="w-16 text-center" value={directHours}
                  onChange={(e) => { setDirectHours(e.target.value); setDurationMinutes((parseInt(e.target.value) || 0) * 60 + (parseInt(directMins) || 0)); }} />
                <span className="text-muted-foreground font-medium">:</span>
                <Input type="number" className="w-16 text-center" value={directMins}
                  onChange={(e) => { setDirectMins(e.target.value); setDurationMinutes((parseInt(directHours) || 0) * 60 + (parseInt(e.target.value) || 0)); }} />
              </div>
            ) : (
              <button
                onClick={() => setDirectInput(true)}
                className="font-mono text-2xl font-bold text-foreground"
              >
                {String(displayH).padStart(2, "0")}:{String(displayM).padStart(2, "0")}
              </button>
            )}
          </div>

          {/* Client */}
          <div><Label>Client</Label><CreatableCombobox items={clients} value={clientId} displayValue={clientName} placeholder="Select client"
            onSelect={(id, name) => { setClientId(id); setClientName(name); setProjectId(""); setProjectName(""); }}
            onCreate={async (name) => { const c = await handleCreateClient(name); if (c) { setClientId(c.id); setClientName(c.name); } return c; }}
          /></div>

          {/* Billable */}
          <div className="flex items-center justify-between"><Label>Billable</Label><Switch checked={billable} onCheckedChange={setBillable} /></div>
          {billable && (
            <div className="flex gap-2">
              <div className="w-20"><Select value={rateCurrency} onValueChange={setRateCurrency}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex-1"><Input type="number" placeholder="0.00" value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} /></div>
              <div className="w-28"><Select value={rateUnit} onValueChange={setRateUnit}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{RATE_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
          )}

          {/* Project */}
          <div><Label>Project</Label><CreatableCombobox items={filteredProjects} value={projectId} displayValue={projectName} placeholder="Select project (optional)"
            onSelect={(id, name) => { setProjectId(id); setProjectName(name); }}
            onCreate={async (name) => { const c = await handleCreateProject(name); if (c) { setProjectId(c.id); setProjectName(c.name); } return c; }}
          /></div>

          {/* Task */}
          <div><Label>Task</Label><CreatableCombobox items={tasks} value={taskId} displayValue={taskName} placeholder="Task (optional)"
            onSelect={(_id, name) => { setTaskId(_id); setTaskName(name); }}
            onCreate={async (name) => { const c = await handleCreateTask(name); if (c) { setTaskId(c.id); setTaskName(c.name); } return c; }}
          /></div>

          {/* Notes */}
          <div><Label>Notes</Label><Textarea placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="flex-1 rounded-[28px] h-12 font-bold" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold" onClick={handleSave} disabled={durationMinutes <= 0 || saving}>Save Call</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CallLogModal;
