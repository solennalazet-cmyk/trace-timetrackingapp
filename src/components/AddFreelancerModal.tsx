import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, Briefcase, User2, CalendarClock } from "lucide-react";

export interface NewFreelancerPayload {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  agreed_daily_hours?: number | null;
  agreed_start_time?: string | null;
  agreed_end_time?: string | null;
  engagement_start_date?: string | null;
  engagement_end_date?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: NewFreelancerPayload) => Promise<void>;
}

const empty = {
  name: "",
  role: "",
  email: "",
  phone: "",
  date_of_birth: "",
  agreed_daily_hours: "",
  agreed_start_time: "",
  agreed_end_time: "",
  engagement_start_date: "",
  engagement_end_date: "",
};

const SectionLabel = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
    <Icon className="h-3.5 w-3.5" />
    {children}
  </div>
);

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-foreground/80">{label} {hint && <span className="text-muted-foreground/70 font-normal">({hint})</span>}</Label>
    {children}
  </div>
);

const AddFreelancerModal = ({ open, onOpenChange, onCreate }: Props) => {
  const [v, setV] = useState(empty);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setV(empty); setBusy(false); } }, [open]);

  const set = (k: keyof typeof empty, val: string) => setV((p) => ({ ...p, [k]: val }));

  const submit = async () => {
    const name = v.name.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreate({
        name,
        role: v.role.trim() || null,
        email: v.email.trim() || null,
        phone: v.phone.trim() || null,
        date_of_birth: v.date_of_birth || null,
        agreed_daily_hours: v.agreed_daily_hours ? Number(v.agreed_daily_hours) : null,
        agreed_start_time: v.agreed_start_time || null,
        agreed_end_time: v.agreed_end_time || null,
        engagement_start_date: v.engagement_start_date || null,
        engagement_end_date: v.engagement_end_date || null,
      });
    } finally { setBusy(false); }
  };

  const focusScroll = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.matches("input, textarea, [role='combobox']")) return;
    setTimeout(() => target.scrollIntoView({ block: "center", behavior: "auto" }), 320);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-[440px] rounded-3xl p-0 overflow-hidden gap-0 flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        position="centered"
      >
        <DialogHeader className="px-6 pt-6 pb-4 space-y-2 bg-gradient-to-b from-primary/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-primary/20 text-foreground flex items-center justify-center">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-lg">Add a freelancer</DialogTitle>
              <p className="text-xs text-muted-foreground leading-snug">
                Only a first name is required — fill anything else you have, or skip and complete later.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0 scroll-pb-32" onFocusCapture={focusScroll}>
          <Field label="First name" hint="required">
            <Input
              autoFocus
              placeholder="e.g. Jacqueline"
              className="h-11 rounded-xl"
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          <SectionLabel icon={Briefcase}>Role</SectionLabel>
          <Field label="Job title">
            <Input
              placeholder="e.g. Site manager"
              className="h-11 rounded-xl"
              value={v.role}
              onChange={(e) => set("role", e.target.value)}
            />
          </Field>

          <SectionLabel icon={User2}>Identity & contact</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" inputMode="email" placeholder="name@…" className="h-11 rounded-xl" value={v.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input type="tel" inputMode="tel" placeholder="+33…" className="h-11 rounded-xl" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          <Field label="Date of birth">
            <Input type="date" className="h-11 rounded-xl" value={v.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>

          <SectionLabel icon={CalendarClock}>Schedule & engagement</SectionLabel>
          <Field label="Agreed daily hours">
            <Input type="number" step="0.25" min="0" max="24" placeholder="e.g. 8" className="h-11 rounded-xl" value={v.agreed_daily_hours} onChange={(e) => set("agreed_daily_hours", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <Input type="time" className="h-11 rounded-xl" value={v.agreed_start_time} onChange={(e) => set("agreed_start_time", e.target.value)} />
            </Field>
            <Field label="End time">
              <Input type="time" className="h-11 rounded-xl" value={v.agreed_end_time} onChange={(e) => set("agreed_end_time", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input type="date" className="h-11 rounded-xl" value={v.engagement_start_date} onChange={(e) => set("engagement_start_date", e.target.value)} />
            </Field>
            <Field label="End date" hint="optional">
              <Input type="date" className="h-11 rounded-xl" value={v.engagement_end_date} onChange={(e) => set("engagement_end_date", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-card flex gap-2.5">
          <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1 rounded-xl h-11" onClick={submit} disabled={!v.name.trim() || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create profile"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddFreelancerModal;
