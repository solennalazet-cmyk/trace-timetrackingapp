import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  week_start_day: number;
  time_format: string;
  default_billable: boolean;
  daily_hour_target: number;
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
  week_start_day: 1,
  time_format: "24h",
  default_billable: true,
  daily_hour_target: 0,
  idle_reminder_minutes: 0,
  default_report_range: "monthly",
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
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [editingPreset, setEditingPreset] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    if (user) {
      const { data } = await supabase
        .from("user_settings")
        .select("timer_presets, pause_mode, timer_sound, theme, show_logged_today, round_duration, round_duration_to, round_amount, round_amount_to")
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
          week_start_day: (data as any).week_start_day ?? DEFAULTS.week_start_day,
          time_format: (data as any).time_format ?? DEFAULTS.time_format,
          default_billable: (data as any).default_billable ?? DEFAULTS.default_billable,
          daily_hour_target: (data as any).daily_hour_target ?? DEFAULTS.daily_hour_target,
          idle_reminder_minutes: (data as any).idle_reminder_minutes ?? DEFAULTS.idle_reminder_minutes,
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
    if (open) { setLoaded(false); loadSettings(); }
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
        week_start_day: updated.week_start_day,
        time_format: updated.time_format,
        default_billable: updated.default_billable,
        daily_hour_target: updated.daily_hour_target,
        idle_reminder_minutes: updated.idle_reminder_minutes,
      } as any, { onConflict: "user_id" });
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
    }
    if (updated.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [user]);

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
    if (isNaN(val) || val < 1 || val > 480) {
      setEditingPreset(null);
      return;
    }
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
      <DialogContent className="max-w-[420px] rounded-2xl max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-1">
          {/* ── Focus Timer Presets ── */}
          <SettingsSection
            title="Focus Timer Presets"
            description="Durations available in Focus mode. Tap a value to edit (in minutes)."
          >
            <div className="flex flex-wrap gap-2">
              {settings.timer_presets.map((mins, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
                >
                  {editingPreset === i ? (
                    <Input
                      className="w-16 h-6 text-xs p-1 border-none bg-transparent text-center"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                      autoFocus
                      placeholder="min"
                    />
                  ) : (
                    <button onClick={() => startEdit(i)} className="font-medium">
                      {formatPreset(mins)}
                    </button>
                  )}
                  {settings.timer_presets.length > 1 && (
                    <button onClick={() => removePreset(i)} className="text-primary/50 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addPreset}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Break Tracking ── */}
          <SettingsSection
            title="Break Tracking"
            description="How paused time is handled in sessions."
          >
            <RadioGroup
              value={settings.pause_mode}
              onValueChange={(v) => persist({ ...settings, pause_mode: v })}
              className="space-y-2"
            >
              <label className="flex items-start gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30 transition-colors">
                <RadioGroupItem value="deduct" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Deduct breaks</p>
                  <p className="text-xs text-muted-foreground">Paused time is subtracted. Only working time is saved.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30 transition-colors">
                <RadioGroupItem value="track" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Track breaks separately</p>
                  <p className="text-xs text-muted-foreground">Break patterns appear in Reports.</p>
                </div>
              </label>
            </RadioGroup>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Timer Sound ── */}
          <SettingsSection
            title="Timer Completion Sound"
            description="Played when a Focus session ends."
          >
            <div className="flex items-center gap-2">
              <Select value={settings.timer_sound} onValueChange={(v) => persist({ ...settings, timer_sound: v })}>
                <SelectTrigger className="flex-1 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chime">Default chime</SelectItem>
                  <SelectItem value="bell">Bell</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
              {settings.timer_sound === "none" ? (
                <VolumeX className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Week Start Day ── */}
          <SettingsSection
            title="Week starts on"
            description="Affects reports and date range calculations."
          >
            <div className="flex gap-2">
              {([{ value: 1, label: "Monday" }, { value: 0, label: "Sunday" }] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => persist({ ...settings, week_start_day: opt.value })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    settings.week_start_day === opt.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Time Format ── */}
          <SettingsSection
            title="Time format"
            description="How times are displayed throughout the app."
          >
            <div className="flex gap-2">
              {([{ value: "24h", label: "24h", example: "14:30" }, { value: "12h", label: "12h", example: "2:30 PM" }] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => persist({ ...settings, time_format: opt.value })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    settings.time_format === opt.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {opt.label} <span className="text-xs text-muted-foreground ml-1">({opt.example})</span>
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Default Billable ── */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">New entries are billable</p>
              <p className="text-xs text-muted-foreground">Default billing status for new time entries.</p>
            </div>
            <Switch
              checked={settings.default_billable}
              onCheckedChange={(v) => persist({ ...settings, default_billable: v })}
            />
          </div>

          <SettingsDivider />

          {/* ── Daily Hour Target ── */}
          <SettingsSection
            title="Daily hour target"
            description="Set a daily work goal. Progress shows in Reports. Set to 0 to disable."
          >
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={settings.daily_hour_target || ""}
                placeholder="0"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  persist({ ...settings, daily_hour_target: isNaN(v) ? 0 : Math.min(24, Math.max(0, v)) });
                }}
                className="w-20 h-10 rounded-xl text-center"
              />
              <span className="text-sm text-muted-foreground">hours / day</span>
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Idle Reminder ── */}
          <SettingsSection
            title="Idle reminder"
            description="Get a notification if no timer is running. Set to 0 to disable."
          >
            <div className="flex items-center gap-3">
              <Select
                value={String(settings.idle_reminder_minutes)}
                onValueChange={(v) => persist({ ...settings, idle_reminder_minutes: parseInt(v) })}
              >
                <SelectTrigger className="w-32 h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Disabled</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Rounding ── */}
          <SettingsSection
            title="Rounding"
            description="Round duration and/or billable amounts. Original values remain visible in entry details."
          >
            <div className="space-y-4">
              {/* Duration rounding */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Duration rounding</Label>
                <div className="flex gap-2">
                  <Select value={settings.round_duration} onValueChange={(v) => persist({ ...settings, round_duration: v })}>
                    <SelectTrigger className="flex-1 h-10 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No rounding</SelectItem>
                      <SelectItem value="up">Round up</SelectItem>
                      <SelectItem value="down">Round down</SelectItem>
                      <SelectItem value="nearest">Nearest</SelectItem>
                    </SelectContent>
                  </Select>
                  {settings.round_duration !== "none" && (
                    <Select value={String(settings.round_duration_to)} onValueChange={(v) => persist({ ...settings, round_duration_to: parseInt(v) })}>
                      <SelectTrigger className="w-24 h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
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
              </div>

              {/* Amount rounding */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Billable amount rounding</Label>
                <div className="flex gap-2">
                  <Select value={settings.round_amount} onValueChange={(v) => persist({ ...settings, round_amount: v })}>
                    <SelectTrigger className="flex-1 h-10 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No rounding</SelectItem>
                      <SelectItem value="up">Round up</SelectItem>
                      <SelectItem value="down">Round down</SelectItem>
                      <SelectItem value="nearest">Nearest</SelectItem>
                    </SelectContent>
                  </Select>
                  {settings.round_amount !== "none" && (
                    <Select value={String(settings.round_amount_to)} onValueChange={(v) => persist({ ...settings, round_amount_to: parseFloat(v) })}>
                      <SelectTrigger className="w-24 h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
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
              </div>
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Appearance ── */}
          <SettingsSection title="Appearance">
            <div className="flex gap-2">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => persist({ ...settings, theme: t })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    settings.theme === t
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsDivider />

          {/* ── Show activity toggle ── */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Show activity on Start page</p>
              <p className="text-xs text-muted-foreground">Display today's entries and unassigned work below the timer.</p>
            </div>
            <Switch
              checked={settings.show_logged_today}
              onCheckedChange={(v) => persist({ ...settings, show_logged_today: v })}
            />
          </div>

          <SettingsDivider />

          {/* ── Integrations ── */}
          <div className="py-4">
            <p className="text-sm font-semibold">Integrations</p>
            <p className="text-xs text-muted-foreground mt-1">
              Integrations with tools like Toggl, Notion, Google Calendar, and more are coming soon.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ── Reusable sub-components ── */

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="py-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SettingsDivider() {
  return <div className="border-t border-border" />;
}

export default SettingsModal;
