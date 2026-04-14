import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { X, Plus, Volume2, VolumeX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import ProBadge from "@/components/ProBadge";
import PaywallModal from "@/components/PaywallModal";
import { type ColorTheme, applyColorTheme, getStoredColorTheme } from "@/hooks/useColorTheme";

const LS_KEY = "trace_user_settings";

interface Settings {
  timer_presets: number[];
  pause_mode: string;
  timer_sound: string;
  theme: string;
  show_logged_today: boolean;
  round_duration: string;
  round_duration_to: number;
  round_amount: string;
  round_amount_to: number;
  round_scope: string;
  week_start_day: number;
  time_format: string;
  default_billable: boolean;
  daily_hour_target: number;
  revenue_target: number;
  idle_reminder_minutes: number;
  default_report_range: string;
}

const DEFAULTS: Settings = {
  timer_presets: [25, 45, 60, 90],
  pause_mode: "deduct",
  timer_sound: "chime",
  theme: "light",
  show_logged_today: true,
  round_duration: "none",
  round_duration_to: 15,
  round_amount: "none",
  round_amount_to: 0.01,
  round_scope: "session",
  week_start_day: 1,
  time_format: "24h",
  default_billable: true,
  daily_hour_target: 0,
  revenue_target: 0,
  idle_reminder_minutes: 0,
  default_report_range: "weekly",
};

const formatPreset = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [editingPreset, setEditingPreset] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(getStoredColorTheme());

  const isPro = profile?.plan === "pro" || profile?.plan === "trial";

  const loadSettings = useCallback(async () => {
    if (user) {
      const { data } = await supabase
        .from("user_settings")
        .select("timer_presets, pause_mode, timer_sound, theme, show_logged_today, round_duration, round_duration_to, round_amount, round_amount_to, round_scope, week_start_day, time_format, default_billable, daily_hour_target, revenue_target, idle_reminder_minutes, default_report_range")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setSettings({
          timer_presets: (data.timer_presets as number[]) ?? DEFAULTS.timer_presets,
          pause_mode: data.pause_mode ?? DEFAULTS.pause_mode,
          timer_sound: data.timer_sound ?? DEFAULTS.timer_sound,
          theme: data.theme ?? DEFAULTS.theme,
          show_logged_today: data.show_logged_today ?? true,
          round_duration: (data as any).round_duration ?? DEFAULTS.round_duration,
          round_duration_to: (data as any).round_duration_to ?? DEFAULTS.round_duration_to,
          round_amount: (data as any).round_amount ?? DEFAULTS.round_amount,
          round_amount_to: (data as any).round_amount_to ?? DEFAULTS.round_amount_to,
          round_scope: (data as any).round_scope ?? DEFAULTS.round_scope,
          week_start_day: (data as any).week_start_day ?? DEFAULTS.week_start_day,
          time_format: (data as any).time_format ?? DEFAULTS.time_format,
          default_billable: (data as any).default_billable ?? DEFAULTS.default_billable,
          daily_hour_target: (data as any).daily_hour_target ?? DEFAULTS.daily_hour_target,
          revenue_target: (data as any).revenue_target ?? DEFAULTS.revenue_target,
          idle_reminder_minutes: (data as any).idle_reminder_minutes ?? DEFAULTS.idle_reminder_minutes,
          default_report_range: (data as any).default_report_range ?? DEFAULTS.default_report_range,
        });
      }
    } else {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch {}
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    if (open) { setLoaded(false); loadSettings(); setColorTheme(getStoredColorTheme()); }
  }, [open, loadSettings]);

  const persist = useCallback(async (updated: Settings) => {
    setSettings(updated);
    if (user) {
      await supabase.from("user_settings").upsert({
        user_id: user.id,
        timer_presets: updated.timer_presets,
        pause_mode: updated.pause_mode,
        timer_sound: updated.timer_sound,
        theme: updated.theme,
        show_logged_today: updated.show_logged_today,
        round_duration: updated.round_duration,
        round_duration_to: updated.round_duration_to,
        round_amount: updated.round_amount,
        round_amount_to: updated.round_amount_to,
        round_scope: updated.round_scope,
        week_start_day: updated.week_start_day,
        time_format: updated.time_format,
        default_billable: updated.default_billable,
        daily_hour_target: updated.daily_hour_target,
        revenue_target: updated.revenue_target,
        idle_reminder_minutes: updated.idle_reminder_minutes,
        default_report_range: updated.default_report_range,
      } as any, { onConflict: "user_id" });
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
    }
    if (updated.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    window.dispatchEvent(new Event("trace-settings-changed"));
  }, [user]);

  const persistOrPaywall = useCallback((updated: Settings) => {
    if (!isPro) { setPaywallOpen(true); return; }
    persist(updated);
  }, [isPro, persist]);

  const removePreset = (index: number) => {
    if (settings.timer_presets.length <= 1) return;
    const next = settings.timer_presets.filter((_, i) => i !== index);
    persist({ ...settings, timer_presets: next });
  };

  const startEdit = (index: number) => {
    setEditingPreset(index);
    setEditValue(String(settings.timer_presets[index]));
  };

  const commitEdit = () => {
    if (editingPreset === null) return;
    const val = parseInt(editValue, 10);
    if (isNaN(val) || val < 1 || val > 480) { setEditingPreset(null); return; }
    const next = [...settings.timer_presets];
    next[editingPreset] = val;
    persist({ ...settings, timer_presets: next });
    setEditingPreset(null);
  };

  const addPreset = () => {
    const next = [...settings.timer_presets, 30];
    persist({ ...settings, timer_presets: next });
    setEditingPreset(next.length - 1);
    setEditValue("30");
  };

  if (!loaded) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent position="centered" className="max-w-[420px] w-[calc(100vw-2rem)] rounded-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden p-0 box-border">
        <DialogHeader className="px-5 pt-6 pb-2">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-6 space-y-4 min-w-0 overflow-x-hidden box-border">

          {/* ── Card 1: Time & Calendar ── */}
          <SettingsCard title="Time & Calendar">
            <CardRow label="Week starts on">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { value: 1, label: "Mon" },
                  { value: 2, label: "Tue" },
                  { value: 3, label: "Wed" },
                  { value: 4, label: "Thu" },
                  { value: 5, label: "Fri" },
                  { value: 6, label: "Sat" },
                  { value: 0, label: "Sun" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => persist({ ...settings, week_start_day: opt.value })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      settings.week_start_day === opt.value
                        ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardRow>
            <CardDivider />
            <CardRow label="Time format">
              <div className="flex gap-2">
                {([
                  { value: "24h", label: "24h" },
                  { value: "12h", label: "12h" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => persist({ ...settings, time_format: opt.value })}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      settings.time_format === opt.value
                        ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardRow>
            <CardDivider />
            <CardRow label="Default report range">
              <div className="flex gap-2">
                {([
                  { value: "weekly", label: "Weekly" },
                  { value: "biweekly", label: "Biweekly" },
                  { value: "monthly", label: "Monthly" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => persist({ ...settings, default_report_range: opt.value })}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      settings.default_report_range === opt.value
                        ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardRow>
          </SettingsCard>

          {/* ── Card 2: Tracking Behavior ── */}
          <SettingsCard title="Tracking Behavior">
            <CardRow label="Break tracking" description="How paused time is handled in sessions.">
              <RadioGroup
                value={settings.pause_mode}
                onValueChange={(v) => persist({ ...settings, pause_mode: v })}
                className="space-y-2"
              >
                <label className="flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="deduct" className="mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">Deduct breaks</p>
                    <p className="text-[11px] text-muted-foreground">Only working time is saved.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="track" className="mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">Track breaks separately</p>
                    <p className="text-[11px] text-muted-foreground">Break patterns appear in Reports.</p>
                  </div>
                </label>
              </RadioGroup>
            </CardRow>
            <CardDivider />
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-xs font-medium">Show activity on Start page</p>
                <p className="text-[11px] text-muted-foreground">Display today's entries below the timer.</p>
              </div>
              <Switch
                checked={settings.show_logged_today}
                onCheckedChange={(v) => persist({ ...settings, show_logged_today: v })}
              />
            </div>
            <CardDivider />
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-xs font-medium">New entries are billable</p>
                <p className="text-[11px] text-muted-foreground">Default billing status for new entries.</p>
              </div>
              <Switch
                checked={settings.default_billable}
                onCheckedChange={(v) => persist({ ...settings, default_billable: v })}
              />
            </div>
          </SettingsCard>

          {/* ── Card 3: Appearance ── */}
          <SettingsCard title="Appearance">
            <CardRow label="Mode">
              <div className="flex gap-2">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => persist({ ...settings, theme: t })}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      settings.theme === t
                        ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {t === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </CardRow>
            <CardDivider />
            <CardRow label="Color theme">
              <div className="flex gap-2">
                {([
                  { value: "sunrise" as ColorTheme, label: "Sunrise", preview: "linear-gradient(135deg, hsl(330, 81%, 60%), hsl(43, 96%, 56%))" },
                  { value: "stormy" as ColorTheme, label: "Stormy Skies", preview: "linear-gradient(135deg, hsl(220, 26%, 34%), hsl(212, 30%, 78%))" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setColorTheme(opt.value);
                      applyColorTheme(opt.value);
                      window.dispatchEvent(new Event("trace-settings-changed"));
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
                      colorTheme === opt.value
                        ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: opt.preview }} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardRow>
          </SettingsCard>

          {/* ── Card 4: Targets (PRO) ── */}
          <ProCard title="Targets" description="Set daily goals to track progress in Reports." isPro={isPro}>
            <CardRow label="Daily hour target">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0} max={24} step={0.5}
                  value={settings.daily_hour_target || ""}
                  placeholder="0"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    persistOrPaywall({ ...settings, daily_hour_target: isNaN(v) ? 0 : Math.min(24, Math.max(0, v)) });
                  }}
                  className="w-16 h-8 rounded-lg text-center text-xs"
                />
                <span className="text-[11px] text-muted-foreground">hours / day</span>
              </div>
            </CardRow>
            <CardDivider />
            <CardRow label="Revenue target">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0} step={100}
                  value={settings.revenue_target || ""}
                  placeholder="0"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    persistOrPaywall({ ...settings, revenue_target: isNaN(v) ? 0 : Math.max(0, v) });
                  }}
                  className="w-20 h-8 rounded-lg text-center text-xs"
                />
                <span className="text-[11px] text-muted-foreground">€ / month</span>
              </div>
            </CardRow>
          </ProCard>

          {/* ── Card 5: Rounding (PRO) ── */}
          <ProCard title="Rounding" description="Fine-tune how durations and amounts are displayed." isPro={isPro}>
            <CardRow label="Duration rounding">
              <div className="flex gap-2">
                <Select value={settings.round_duration} onValueChange={(v) => isPro ? persist({ ...settings, round_duration: v }) : setPaywallOpen(true)}>
                  <SelectTrigger className="flex-1 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rounding</SelectItem>
                    <SelectItem value="up">Round up</SelectItem>
                    <SelectItem value="down">Round down</SelectItem>
                    <SelectItem value="nearest">Nearest</SelectItem>
                  </SelectContent>
                </Select>
                {settings.round_duration !== "none" && (
                  <Select value={String(settings.round_duration_to)} onValueChange={(v) => isPro ? persist({ ...settings, round_duration_to: parseInt(v) }) : setPaywallOpen(true)}>
                    <SelectTrigger className="w-20 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 min</SelectItem>
                      <SelectItem value="5">5 min</SelectItem>
                      <SelectItem value="6">6 min</SelectItem>
                      <SelectItem value="10">10 min</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardRow>
            <CardDivider />
            <CardRow label="Amount rounding">
              <div className="flex gap-2">
                <Select value={settings.round_amount} onValueChange={(v) => isPro ? persist({ ...settings, round_amount: v }) : setPaywallOpen(true)}>
                  <SelectTrigger className="flex-1 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rounding</SelectItem>
                    <SelectItem value="up">Round up</SelectItem>
                    <SelectItem value="down">Round down</SelectItem>
                    <SelectItem value="nearest">Nearest</SelectItem>
                  </SelectContent>
                </Select>
                {settings.round_amount !== "none" && (
                  <Select value={String(settings.round_amount_to)} onValueChange={(v) => isPro ? persist({ ...settings, round_amount_to: parseFloat(v) }) : setPaywallOpen(true)}>
                    <SelectTrigger className="w-20 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.01">0.01</SelectItem>
                      <SelectItem value="0.05">0.05</SelectItem>
                      <SelectItem value="0.10">0.10</SelectItem>
                      <SelectItem value="0.50">0.50</SelectItem>
                      <SelectItem value="1">1.00</SelectItem>
                      <SelectItem value="5">5.00</SelectItem>
                      <SelectItem value="10">10.00</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardRow>
            {(settings.round_duration !== "none" || settings.round_amount !== "none") && (
              <>
                <CardDivider />
                <CardRow label="Apply rounding to">
                  <Select value={settings.round_scope} onValueChange={(v) => isPro ? persist({ ...settings, round_scope: v }) : setPaywallOpen(true)}>
                    <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="session">Each session</SelectItem>
                      <SelectItem value="total">Totals only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">
                    {settings.round_scope === "session"
                      ? "Each entry is rounded before summing."
                      : "Raw values are summed first, then rounded."}
                  </p>
                </CardRow>
              </>
            )}
          </ProCard>

          {/* ── Card 6: Timer ── */}
          <SettingsCard title="Timer">
            <CardRow label="Completion sound" description="Played when a Focus session ends.">
              <div className="flex items-center gap-2">
                <Select value={settings.timer_sound} onValueChange={(v) => persist({ ...settings, timer_sound: v })}>
                  <SelectTrigger className="flex-1 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chime">Default chime</SelectItem>
                    <SelectItem value="bell">Bell</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
                {settings.timer_sound === "none"
                  ? <VolumeX className="w-4 h-4 text-muted-foreground shrink-0" />
                  : <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
                }
              </div>
            </CardRow>
            <CardDivider />
            <CardRow label="Focus presets" description="Tap a value to edit (in minutes).">
              <div className="flex flex-wrap gap-1.5">
                {settings.timer_presets.map((mins, i) => (
                  <div key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 text-foreground text-xs font-medium">
                    {editingPreset === i ? (
                      <Input
                        className="w-12 h-5 text-[11px] p-0.5 border-none bg-transparent text-center"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                        autoFocus
                        placeholder="min"
                      />
                    ) : (
                      <button onClick={() => startEdit(i)} className="font-medium">{formatPreset(mins)}</button>
                    )}
                    {settings.timer_presets.length > 1 && (
                      <button onClick={() => removePreset(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addPreset}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </CardRow>
            <CardDivider />
            <CardRow label="Idle reminder" description="Remind to stop a running session.">
              <Select
                value={String(settings.idle_reminder_minutes)}
                onValueChange={(v) => persist({ ...settings, idle_reminder_minutes: parseInt(v) })}
              >
                <SelectTrigger className="w-28 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Disabled</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                </SelectContent>
              </Select>
            </CardRow>
          </SettingsCard>

          {/* ── Card 7: Integrations (placeholder) ── */}
          <SettingsCard title="Integrations">
            <p className="text-[11px] text-muted-foreground py-1">
              Google Calendar and more coming soon.
            </p>
          </SettingsCard>

        </div>
      </DialogContent>

      <PaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        headline="This is a Pro feature"
        body="Upgrade to Trace Pro to unlock targets, rounding, and more."
      />
    </Dialog>
  );
};

/* ── Card primitives ── */

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children}
    </div>
  );
}

function ProCard({ title, description, isPro, children }: { title: string; description?: string; isPro: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 relative overflow-hidden">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <ProBadge />
      </div>
      {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      <div className={isPro ? "" : "pointer-events-none select-none"}>
        <div className={isPro ? "" : "opacity-30 blur-[1px]"}>
          {children}
        </div>
      </div>
      {!isPro && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl">
          <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-3 py-1.5 rounded-full shadow-sm border border-border">
            {title} is a Pro feature
          </span>
        </div>
      )}
    </div>
  );
}

function CardRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs font-medium">{label}</Label>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function CardDivider() {
  return <div className="border-t border-border/50" />;
}

export default SettingsModal;
