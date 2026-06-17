import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type AccountEditorKind = "contact" | "commercial" | "business";

interface EditorField {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "number" | "textarea";
  placeholder?: string;
  step?: string;
  min?: string;
  half?: boolean;
  rows?: number;
}

interface Initial {
  name: string | null;
  email: string | null;
  phone: string | null;
  default_rate: number | null;
  currency: string | null;
  payment_terms_days: number | null;
  billing_notes: string | null;
  nif: string | null;
  business_address: string | null;
}

interface Props {
  open: boolean;
  kind: AccountEditorKind | null;
  clientId: string;
  initial: Initial;
  onClose: () => void;
  onSaved: () => void;
}

const FIELDS: Record<AccountEditorKind, { title: string; subtitle: string; fields: EditorField[] }> = {
  contact: {
    title: "Contact",
    subtitle: "How to reach this client.",
    fields: [
      { key: "name", label: "Client name", type: "text", placeholder: "Acme Ltd." },
      { key: "email", label: "Email", type: "email", placeholder: "billing@acme.com" },
      { key: "phone", label: "Phone", type: "tel", placeholder: "+33 …" },
    ],
  },
  commercial: {
    title: "Commercial agreement",
    subtitle: "Rate and billing terms.",
    fields: [
      { key: "default_rate", label: "Default hourly rate", type: "number", step: "0.01", min: "0", placeholder: "e.g. 75", half: true },
      { key: "currency", label: "Currency", type: "text", placeholder: "EUR", half: true },
      { key: "payment_terms_days", label: "Payment terms (days)", type: "number", step: "1", min: "0", placeholder: "e.g. 30" },
      { key: "billing_notes", label: "Billing notes", type: "textarea", rows: 3, placeholder: "PO required, send to AP, etc." },
    ],
  },
  business: {
    title: "Business details",
    subtitle: "Administrative information.",
    fields: [
      { key: "nif", label: "NIF / VAT number", type: "text", placeholder: "FR12345678901" },
      { key: "business_address", label: "Registered address", type: "textarea", rows: 4, placeholder: "Street, city, postcode, country" },
    ],
  },
};

const AccountFocusEditor = ({ open, kind, clientId, initial, onClose, onSaved }: Props) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [kbInset, setKbInset] = useState(0);

  useEffect(() => {
    if (!open || !kind) return;
    const v: Record<string, string> = {};
    for (const f of FIELDS[kind].fields) {
      const raw = (initial as any)[f.key];
      v[f.key] = raw == null ? "" : String(raw);
    }
    setValues(v);
  }, [open, kind, initial]);

  useEffect(() => {
    if (!open) { setKbInset(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(inset);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

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

  const focusScroll = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 250);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl p-0 flex flex-col"
        style={{ maxHeight: `calc(100dvh - ${kbInset}px)`, height: `calc(100dvh - ${kbInset}px - 2rem)` }}
      >
        <SheetHeader className="text-left px-5 pt-4 pb-3 shrink-0">
          <SheetTitle className="text-lg">{cfg.title}</SheetTitle>
          <p className="text-xs text-muted-foreground">{cfg.subtitle}</p>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 px-5 overflow-y-auto flex-1" style={{ paddingBottom: 16 }}>
          {cfg.fields.map((f) => (
            <div key={f.key} className={`space-y-1.5 ${f.half ? "col-span-1" : "col-span-2"}`}>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  rows={f.rows ?? 3}
                  onFocus={focusScroll}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="text-sm rounded-xl resize-none"
                />
              ) : (
                <Input
                  type={f.type}
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  step={f.step}
                  min={f.min}
                  onFocus={focusScroll}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="h-11 text-sm rounded-xl"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border bg-card shrink-0">
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

export default AccountFocusEditor;
