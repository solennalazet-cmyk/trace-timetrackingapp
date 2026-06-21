import { useEffect, useState } from "react";
import { Pencil, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  /** clients.id row for this worker (employer-owned link row). */
  clientId: string;
}

interface WorkerFields {
  name: string;
  email: string;
  phone: string;
  agreed_daily_hours: string;
  agreed_start_time: string;
  agreed_end_time: string;
  engagement_start_date: string;
  engagement_end_date: string;
  scheduled_days: number[];
}

const empty: WorkerFields = {
  name: "",
  email: "",
  phone: "",
  agreed_daily_hours: "",
  agreed_start_time: "",
  agreed_end_time: "",
  engagement_start_date: "",
  engagement_end_date: "",
  scheduled_days: [1, 2, 3, 4, 5],
};

const WorkerEditForm = ({ clientId }: Props) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<WorkerFields>(empty);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("name, email, phone, agreed_daily_hours, agreed_start_time, agreed_end_time, engagement_start_date, engagement_end_date")
        .eq("id", clientId)
        .maybeSingle();
      if (error) { toast.error(error.message); return; }
      if (data) {
        setValues({
          name: data.name ?? "",
          email: data.email ?? "",
          phone: (data as any).phone ?? "",
          agreed_daily_hours: (data as any).agreed_daily_hours != null ? String((data as any).agreed_daily_hours) : "",
          agreed_start_time: (data as any).agreed_start_time ?? "",
          agreed_end_time: (data as any).agreed_end_time ?? "",
          engagement_start_date: (data as any).engagement_start_date ?? "",
          engagement_end_date: (data as any).engagement_end_date ?? "",
        });
      }
      setLoaded(true);
    })();
  }, [open, loaded, clientId]);

  const set = <K extends keyof WorkerFields>(k: K, v: WorkerFields[K]) =>
    setValues((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const payload: any = {
      name: values.name.trim() || null,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      agreed_daily_hours: values.agreed_daily_hours ? Number(values.agreed_daily_hours) : null,
      agreed_start_time: values.agreed_start_time || null,
      agreed_end_time: values.agreed_end_time || null,
      engagement_start_date: values.engagement_start_date || null,
      engagement_end_date: values.engagement_end_date || null,
    };
    const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Worker details saved.");
    setEditing(false);
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right truncate">{value || "—"}</span>
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors"
      >
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <Pencil className="w-3 h-3 text-muted-foreground" /> Details & agreement
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border/60 space-y-2">
          {!loaded ? (
            <p className="text-[11px] text-muted-foreground py-2 text-center">Loading…</p>
          ) : !editing ? (
            <>
              <div className="space-y-0.5">
                <Row label="Name" value={values.name} />
                <Row label="Email" value={values.email} />
                <Row label="Phone" value={values.phone} />
                <Row label="Agreed daily hours" value={values.agreed_daily_hours ? `${values.agreed_daily_hours}h` : ""} />
                <Row label="Shift" value={values.agreed_start_time && values.agreed_end_time ? `${values.agreed_start_time} – ${values.agreed_end_time}` : (values.agreed_start_time || values.agreed_end_time || "")} />
                <Row label="Start date" value={values.engagement_start_date} />
                <Row label="End date" value={values.engagement_end_date} />
              </div>
              <Button size="sm" variant="outline" className="w-full h-8 rounded-lg text-xs" onClick={() => setEditing(true)}>
                <Pencil className="w-3 h-3" /> Edit
              </Button>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</Label>
                <Input value={values.name} onChange={(e) => set("name", e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Email</Label>
                  <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone</Label>
                  <Input type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Agreed daily hours</Label>
                <Input type="number" step="0.25" min="0" max="24" value={values.agreed_daily_hours} onChange={(e) => set("agreed_daily_hours", e.target.value)} className="h-9 text-sm" placeholder="e.g. 8" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start time</Label>
                  <Input type="time" value={values.agreed_start_time} onChange={(e) => set("agreed_start_time", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">End time</Label>
                  <Input type="time" value={values.agreed_end_time} onChange={(e) => set("agreed_end_time", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start date</Label>
                  <Input type="date" value={values.engagement_start_date} onChange={(e) => set("engagement_start_date", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">End date <span className="normal-case text-muted-foreground/70">(optional)</span></Label>
                  <Input type="date" value={values.engagement_end_date} onChange={(e) => set("engagement_end_date", e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="ghost" className="flex-1 h-8 rounded-lg text-xs" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" className="flex-1 h-8 rounded-lg text-xs" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkerEditForm;
