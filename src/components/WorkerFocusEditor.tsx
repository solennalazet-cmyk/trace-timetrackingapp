import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type EditorKind = "identity" | "role" | "engagement";

export interface EditorField {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "time" | "number";
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
  half?: boolean;
}

interface Initial {
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
}

interface Props {
  open: boolean;
  kind: EditorKind | null;
  clientId: string;
  initial: Initial;
  onClose: () => void;
  onSaved: () => void;
}

const FIELDS: Record<EditorKind, { title: string; subtitle: string; fields: EditorField[] }> = {
  identity: {
    title: "Identity & contact",
    subtitle: "Personal details to reach them.",
    fields: [
      { key: "name", label: "Full name", type: "text", placeholder: "Jane Doe" },
      { key: "email", label: "Email", type: "email", placeholder: "jane@example.com" },
      { key: "phone", label: "Phone", type: "tel", placeholder: "+33 …" },
      { key: "date_of_birth", label: "Date of birth", type: "date" },
    ],
  },
  role: {
    title: "Role",
    subtitle: "What they're hired to do.",
    fields: [
      { key: "role", label: "Job title", type: "text", placeholder: "e.g. Server, Cleaner, Site manager" },
    ],
  },
  engagement: {
    title: "Schedule & engagement",
    subtitle: "Agreed hours and the dates they cover.",
    fields: [
      { key: "agreed_daily_hours", label: "Agreed daily hours", type: "number", step: "0.25", min: "0", max: "24", placeholder: "e.g. 8" },
      { key: "agreed_start_time", label: "Shift starts", type: "time", half: true },
      { key: "agreed_end_time", label: "Shift ends", type: "time", half: true },
      { key: "engagement_start_date", label: "Start date", type: "date", half: true },
      { key: "engagement_end_date", label: "End date (optional)", type: "date", half: true },
    ],
  },
};

const WorkerFocusEditor = ({ open, kind, clientId, initial, onClose, onSaved }: Props) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !kind) return;
    const v: Record<string, string> = {};
    for (const f of FIELDS[kind].fields) {
      const raw = (initial as any)[f.key];
      v[f.key] = raw == null ? "" : String(raw);
    }
    setValues(v);
  }, [open, kind, initial]);

  if (!kind) return null;
  const cfg = FIELDS[kind];

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const payload: Record<string, any> = {};
    for (const f of cfg.fields) {
      const v = (values[f.key] ?? "").trim();
      if (f.type === "number") payload[f.key] = v ? Number(v) : null;
      else payload[f.key] = v || null;
    }
    const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved.");
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-4 pb-6 max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="text-lg">{cfg.title}</SheetTitle>
          <p className="text-xs text-muted-foreground">{cfg.subtitle}</p>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3">
          {cfg.fields.map((f) => (
            <div key={f.key} className={`space-y-1.5 ${f.half ? "col-span-1" : "col-span-2"}`}>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</Label>
              <Input
                type={f.type}
                value={values[f.key] ?? ""}
                placeholder={f.placeholder}
                step={f.step}
                min={f.min}
                max={f.max}
                onChange={(e) => set(f.key, e.target.value)}
                className="h-11 text-sm rounded-xl"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-5">
          <Button variant="ghost" className="flex-1 h-11 rounded-xl" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1 h-11 rounded-xl" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default WorkerFocusEditor;
