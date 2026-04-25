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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClientFormData {
  name: string;
  email: string;
  nif: string;
  currency: string;
  default_rate: string;
  rate_unit: string;
}

interface ClientFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: ClientFormData) => Promise<void>;
  onDelete?: () => void;
  initial?: ClientFormData | null;
  title?: string;
}

const CURRENCIES = [
  { value: "EUR", label: "EUR (€)" },
  { value: "USD", label: "USD ($)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "CAD", label: "CAD (C$)" },
  { value: "AUD", label: "AUD (A$)" },
  { value: "CHF", label: "CHF" },
];

const RATE_UNITS = [
  { value: "hour", label: "Per hour" },
  { value: "word", label: "Per word" },
  { value: "project", label: "Per project" },
];

const ClientFormModal = ({ open, onOpenChange, onSave, onDelete, initial, title = "Add Client" }: ClientFormModalProps) => {
  const [form, setForm] = useState<ClientFormData>({
    name: "", email: "", nif: "", currency: "EUR", default_rate: "", rate_unit: "hour",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? { name: "", email: "", nif: "", currency: "EUR", default_rate: "", rate_unit: "hour" });
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Organisation name *</Label>
            <Input className="h-10 rounded-xl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Client name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Contact email</Label>
            <Input className="h-10 rounded-xl" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">NIF / Tax number</Label>
            <Input className="h-10 rounded-xl" value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} placeholder="PT123456789" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm">Default billing rate</Label>
              <Input className="h-10 rounded-xl" type="number" placeholder="0.00" value={form.default_rate} onChange={(e) => setForm({ ...form, default_rate: e.target.value })} />
            </div>
            <div className="w-32 space-y-1.5">
              <Label className="text-sm">Unit</Label>
              <Select value={form.rate_unit} onValueChange={(v) => setForm({ ...form, rate_unit: v })}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pt-2">
          <Button variant="outline" className="flex-1 rounded-[28px] h-12 font-bold" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold" onClick={handleSave} disabled={!form.name.trim() || saving}>
            {initial ? "Save Changes" : "Save Client"}
          </Button>
        </div>
        {onDelete && initial && (
          <button className="w-full text-center text-sm text-destructive hover:underline px-6 pb-6 pt-3" onClick={onDelete}>
            Delete client
          </button>
        )}
        {!(onDelete && initial) && <div className="pb-6" />}
      </DialogContent>
    </Dialog>
  );
};

export default ClientFormModal;
