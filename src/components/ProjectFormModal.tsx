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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectFormData {
  name: string;
  rate: string;
  rate_unit: string;
  currency: string;
}

interface ProjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: ProjectFormData) => Promise<void>;
  onDelete?: () => void;
  initial?: ProjectFormData | null;
  clientCurrency?: string;
  clientRate?: number | null;
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

const ProjectFormModal = ({ open, onOpenChange, onSave, onDelete, initial, clientCurrency = "EUR", clientRate, title = "Add Project" }: ProjectFormModalProps) => {
  const [form, setForm] = useState<ProjectFormData>({
    name: "", rate: "", rate_unit: "hour", currency: clientCurrency,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? { name: "", rate: "", rate_unit: "hour", currency: clientCurrency });
    }
  }, [open, initial, clientCurrency]);

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
            <Label className="text-sm">Project name *</Label>
            <Input className="h-10 rounded-xl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Project name" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm">Rate {clientRate ? `(default: ${clientRate})` : "(optional)"}</Label>
              <Input className="h-10 rounded-xl" type="number" placeholder={clientRate ? String(clientRate) : "0.00"} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
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
          <div className="space-y-1.5">
            <Label className="text-sm">Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6 pt-2">
          <Button variant="outline" className="flex-1 rounded-[28px] h-12 font-bold" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-[28px] h-12 font-bold" onClick={handleSave} disabled={!form.name.trim() || saving}>
            {initial ? "Save Changes" : "Add Project"}
          </Button>
        </div>
        {onDelete && initial && (
          <button className="w-full text-center text-sm text-destructive hover:underline px-6 pb-4 -mt-2" onClick={onDelete}>
            Delete project
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFormModal;
