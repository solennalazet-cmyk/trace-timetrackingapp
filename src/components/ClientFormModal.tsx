import { useState, useEffect } from "react";
import { ChevronDown, MapPin, Loader2, UserPlus, FileDown, Send } from "lucide-react";
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
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import ExportColumnsPicker from "@/components/ExportColumnsPicker";
import { type ExportColumnKey, resolveExportColumns } from "@/lib/export-columns";
import { requestLocation, type ClientGeoOverride } from "@/lib/geolocation";
import { cn } from "@/lib/utils";

interface ClientFormData {
  name: string;
  email: string;
  nif: string;
  currency: string;
  default_rate: string;
  rate_unit: string;
  export_columns?: ExportColumnKey[];
  site_address?: string | null;
  site_lat?: number | null;
  site_lng?: number | null;
  site_radius_m?: number | null;
  geolocation_override?: ClientGeoOverride;
  /** If set, send a Trace connection invite to this email on save. */
  invited_trace_email?: string | null;
  /** Read-only: current connection status of the client row, if any. */
  connection_status?: string | null;
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
    export_columns: resolveExportColumns(null),
    site_address: "", site_lat: null, site_lng: null, site_radius_m: 100,
    geolocation_override: "inherit",
    invited_trace_email: "",
  });
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [capturingLoc, setCapturingLoc] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? {
        name: "", email: "", nif: "", currency: "EUR", default_rate: "", rate_unit: "hour",
        export_columns: resolveExportColumns(null),
        site_address: "", site_lat: null, site_lng: null, site_radius_m: 100,
        geolocation_override: "inherit",
        invited_trace_email: "",
      });
      setExportOpen(false);
      setSiteOpen(false);
      setConnectOpen(false);
    }
  }, [open, initial]);

  const captureCurrentLocation = async () => {
    if (capturingLoc) return;
    setCapturingLoc(true);
    const loc = await requestLocation();
    setCapturingLoc(false);
    if (!loc) {
      toast.error("Couldn't get your location. Check browser permissions and try again.");
      return;
    }
    setForm((f) => ({ ...f, site_lat: loc.lat, site_lng: loc.lng }));
    toast.success(`Location set (±${loc.accuracy_m}m). Add an address label if you like.`);
  };

  const handleSave = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-2xl p-0 max-h-[90vh] overflow-y-auto">
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

          {/* Connect Trace user */}
          <div className="rounded-xl bg-secondary overflow-hidden shadow-sm transition-colors hover:bg-secondary/80">
            <button
              type="button"
              onClick={() => setConnectOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
              aria-expanded={connectOpen}
            >
              <span className="text-sm font-semibold text-secondary-foreground flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <UserPlus className="h-4 w-4" />
                </span>
                Connect Trace user
                {form.connection_status === "pending" && (
                  <span className="text-[10px] font-normal text-muted-foreground">· pending</span>
                )}
                {form.connection_status === "accepted" && (
                  <span className="text-[10px] font-normal text-primary">· connected</span>
                )}
                {form.connection_status === "rejected" && (
                  <span className="text-[10px] font-normal text-destructive">· declined</span>
                )}
              </span>
              <ChevronDown className={cn("h-4 w-4 text-secondary-foreground/70 transition-transform", connectOpen && "rotate-180")} />
            </button>

            {connectOpen && (
              <div className="px-4 pb-4 pt-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Invite this client to Trace so you can submit reports directly. They'll see an invite next time they sign in.
                </p>
                <Input
                  className="h-10 rounded-xl"
                  type="email"
                  placeholder="client@example.com"
                  value={form.invited_trace_email ?? ""}
                  onChange={(e) => setForm({ ...form, invited_trace_email: e.target.value })}
                  disabled={form.connection_status === "accepted"}
                />
                {form.connection_status !== "accepted" && (
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !form.name.trim() || !form.invited_trace_email?.trim()}
                    className="w-full h-10 rounded-xl gap-2"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {form.connection_status === "pending" ? "Resend connection request" : "Send connection request"}
                  </Button>
                )}
                {form.connection_status === "pending" && (
                  <p className="text-[11px] text-muted-foreground">Invite is waiting on the client to respond.</p>
                )}

              </div>
            )}
          </div>

          {/* Place of work */}
          <div className="rounded-xl bg-secondary overflow-hidden shadow-sm transition-colors hover:bg-secondary/80">
            <button
              type="button"
              onClick={() => setSiteOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
              aria-expanded={siteOpen}
            >
              <span className="text-sm font-semibold text-secondary-foreground flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                Place of work
                {form.site_lat != null && (
                  <span className="text-[10px] font-normal text-muted-foreground">· set</span>
                )}
              </span>
              <ChevronDown className={cn("h-4 w-4 text-secondary-foreground/70 transition-transform", siteOpen && "rotate-180")} />
            </button>

            {siteOpen && (
              <div className="px-4 pb-4 pt-1 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Optional. When set, clock in/out can be tagged as <span className="font-medium text-foreground">On-site</span> or <span className="font-medium text-foreground">Off-site</span> on exports.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Address (optional label)</Label>
                  <Input
                    className="h-10 rounded-xl"
                    value={form.site_address ?? ""}
                    onChange={(e) => setForm({ ...form, site_address: e.target.value })}
                    placeholder="e.g. Office, Warehouse 2"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl h-10 gap-2"
                  onClick={captureCurrentLocation}
                  disabled={capturingLoc}
                >
                  {capturingLoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {form.site_lat != null ? "Update with current location" : "Use current location"}
                </Button>
                {form.site_lat != null && form.site_lng != null && (
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {form.site_lat.toFixed(5)}, {form.site_lng.toFixed(5)}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center justify-between">
                    <span>Geofence radius</span>
                    <span className="text-muted-foreground">{form.site_radius_m ?? 100}m</span>
                  </Label>
                  <Slider
                    min={50}
                    max={500}
                    step={10}
                    value={[form.site_radius_m ?? 100]}
                    onValueChange={([v]) => setForm({ ...form, site_radius_m: v })}
                  />
                  <p className="text-[11px] text-muted-foreground">Workers within this distance count as On-site.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location capture for this client</Label>
                  <Select
                    value={form.geolocation_override ?? "inherit"}
                    onValueChange={(v: ClientGeoOverride) => setForm({ ...form, geolocation_override: v })}
                  >
                    <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">Use global setting</SelectItem>
                      <SelectItem value="always">Always capture</SelectItem>
                      <SelectItem value="never">Never capture</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>


          {/* Export settings */}
          <div className="rounded-xl bg-secondary overflow-hidden shadow-sm transition-colors hover:bg-secondary/80">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
              aria-expanded={exportOpen}
            >
              <span className="text-sm font-semibold text-secondary-foreground flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <FileDown className="h-4 w-4" />
                </span>
                Shared report settings
              </span>
              <ChevronDown className={cn("h-4 w-4 text-secondary-foreground/70 transition-transform", exportOpen && "rotate-180")} />
            </button>

            {exportOpen && (
              <div className="px-4 pb-4 pt-1 space-y-3">
                <p className="text-xs text-secondary-foreground/80">
                  Columns to include when exporting, sharing, or submitting reports for this client. Date, duration and amount are always included.
                </p>
                <ExportColumnsPicker
                  value={form.export_columns ?? resolveExportColumns(null)}
                  onChange={(next) => setForm({ ...form, export_columns: next })}
                />
              </div>
            )}
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
