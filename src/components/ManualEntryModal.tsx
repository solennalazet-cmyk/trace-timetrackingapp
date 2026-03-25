import { useState, useEffect, useCallback, useRef } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import CreatableCombobox, { ComboboxItem } from "@/components/CreatableCombobox";
import TagsInput from "@/components/TagsInput";
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

interface ManualEntryModalProps {
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

const ManualEntryModal = ({ open, onOpenChange, onSaved }: ManualEntryModalProps) => {
  const { user } = useAuth();
  const hoursRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");

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
      const { data: tagEntries } = await supabase.from("time_entries").select("tags").eq("user_id", user.id).not("tags", "is", null).is("deleted_at", null);
      const tagSet = new Set<string>();
      tagEntries?.forEach((e) => e.tags?.forEach((t: string) => tagSet.add(t)));
      setAllTags(Array.from(tagSet).sort());
    } else {
      setClientsFull(getAnonymousClients().map((c: any) => ({ id: c.id, name: c.name, default_rate: c.default_rate ?? null, currency: c.currency ?? null })));
      setAllProjectsFull(getAnonymousProjects().map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id ?? null, rate: p.rate ?? null, currency: p.currency ?? null })));
      setTasks(getAnonymousTasks().map((t: any) => ({ id: t.id, name: t.name })));
      setAllTags([]);
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setDate(new Date()); setHours(""); setMinutes("");
    setClientId(""); setClientName(""); setProjectId(""); setProjectName("");
    setTaskId(""); setTaskName(""); setNotes(""); setTags([]);
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

  const totalMinutes = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
  const canSave = totalMinutes > 0;

  const handleCreateClient = async (name: string): Promise<ComboboxItem | null> => {
    if (user) {
      const { data } = await supabase.from("clients").insert({ name, user_id: user.id }).select("id, name, default_rate, currency").single();
      if (!data) return null;
      setClientsFull((prev) => [...prev, data as ClientFull]);
      return { id: data.id, name: data.name };
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
      if (!data) return null;
      setAllProjectsFull((prev) => [...prev, data as ProjectFull]); return { id: data.id, name: data.name };
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
      if (!data) return null;
      setTasks((prev) => [...prev, { id: data.id, name: data.name }]); return { id: data.id, name: data.name };
    }
    const id = `local-${Date.now()}`; saveAnonymousTask({ id, name });
    setTasks((prev) => [...prev, { id, name }]); return { id, name };
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const rateNum = rateAmount ? parseFloat(rateAmount) : null;
      let billableValue: number | null = null;
      if (billable && rateNum) {
        if (rateUnit === "hour") billableValue = (totalMinutes / 60) * rateNum;
        else if (rateUnit === "project") billableValue = rateNum;
        else billableValue = rateNum;
      }

      const entry: any = {
        duration_minutes: totalMinutes,
        break_minutes: 0,
        entry_type: "manual",
        entry_date: format(date, "yyyy-MM-dd"),
        billable,
        billing_status: "unbilled",
        client_id: clientId || null,
        project_id: projectId || null,
        notes: notes || null,
        tags: tags.length ? tags : null,
        rate_amount: rateNum,
        rate_currency: rateCurrency,
        rate_unit: rateNum ? rateUnit : null,
        billable_value: billableValue,
      };

      if (user) {
        const { error } = await supabase.from("time_entries").insert({ ...entry, user_id: user.id });
        if (error) throw error;
      } else {
        saveAnonymousEntry(entry);
      }

      toast.success("Entry saved.");
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Something went wrong. Try again.");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-t-2xl sm:rounded-2xl p-6 flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
          {/* Date */}
          <div>
            <Label>Date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal h-10", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) { setDate(d); setCalendarOpen(false); setTimeout(() => hoursRef.current?.focus(), 100); }
                  }}
                  disabled={(d) => d > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Duration */}
          <div>
            <Label>Duration</Label>
            <div className="flex gap-2 items-center">
              <div className="flex-1 flex items-center gap-1">
                <Input
                  ref={hoursRef}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="text-center"
                />
                <span className="text-sm text-muted-foreground font-medium">h</span>
              </div>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  placeholder="0"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="text-center"
                />
                <span className="text-sm text-muted-foreground font-medium">m</span>
              </div>
            </div>
          </div>

          {/* Client */}
          <div>
            <Label>Client</Label>
            <CreatableCombobox items={clients} value={clientId} displayValue={clientName} placeholder="Select client (optional)"
              onSelect={(id, name) => { setClientId(id); setClientName(name); setProjectId(""); setProjectName(""); }}
              onCreate={async (name) => { const c = await handleCreateClient(name); if (c) { setClientId(c.id); setClientName(c.name); setProjectId(""); setProjectName(""); } return c; }}
            />
          </div>

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
          <div><Label>Task</Label><CreatableCombobox items={tasks} value={taskId} displayValue={taskName} placeholder="What were you working on?"
            onSelect={(_id, name) => { setTaskId(_id); setTaskName(name); }}
            onCreate={async (name) => { const c = await handleCreateTask(name); if (c) { setTaskId(c.id); setTaskName(c.name); } return c; }}
          /></div>

          {/* Notes */}
          <div><Label>Notes</Label><Textarea placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>

          {/* Tags */}
          <div><Label>Tags</Label><TagsInput value={tags} onChange={setTags} suggestions={allTags} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="flex-1 rounded-[28px] h-12 font-bold" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold" onClick={handleSave} disabled={!canSave || saving}>Save Entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualEntryModal;
