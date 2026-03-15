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
import { toast } from "sonner";

const LS_KEY = "trace_user_settings";

interface Settings {
  timer_presets: number[];
  pause_mode: string;
  timer_sound: string;
  theme: string;
  show_logged_today: boolean;
}

const DEFAULTS: Settings = {
  timer_presets: [25, 45, 60, 90],
  pause_mode: "deduct",
  timer_sound: "chime",
  theme: "light",
  show_logged_today: true,
};

const INTEGRATION_LOGOS = [
  { name: "Toggl", icon: "T" },
  { name: "Harvest", icon: "H" },
  { name: "Notion", icon: "N" },
  { name: "Google Calendar", icon: "G" },
  { name: "Jira", icon: "J" },
  { name: "Asana", icon: "A" },
];

const formatPreset = (mins: number) => {
  if (mins < 60) return `${mins}m`;
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
        .select("timer_presets, pause_mode, timer_sound, theme, show_logged_today")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setSettings({
          timer_presets: (data.timer_presets as number[]) ?? DEFAULTS.timer_presets,
          pause_mode: data.pause_mode ?? DEFAULTS.pause_mode,
          timer_sound: data.timer_sound ?? DEFAULTS.timer_sound,
          theme: data.theme ?? DEFAULTS.theme,
          show_logged_today: data.show_logged_today ?? true,
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
      }, { onConflict: "user_id" });
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
    }
    // Apply theme immediately
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
      <DialogContent className="max-w-[420px] rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Timer Presets */}
          <div>
            <Label className="text-sm font-semibold">Focus Timer Presets</Label>
            <p className="text-xs text-muted-foreground mb-2">Set the durations available in Focus mode.</p>
            <div className="flex flex-wrap gap-2">
              {settings.timer_presets.map((mins, i) => (
                <div key={i} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-border bg-card text-sm">
                  {editingPreset === i ? (
                    <Input
                      className="w-14 h-6 text-xs p-1 border-none bg-transparent"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === "Enter" && commitEdit()}
                      autoFocus
                      placeholder="min"
                    />
                  ) : (
                    <button onClick={() => startEdit(i)} className="text-sm font-medium">
                      {formatPreset(mins)}
                    </button>
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
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </div>

          {/* Pause Behaviour */}
          <div>
            <Label className="text-sm font-semibold">Break Tracking</Label>
            <p className="text-xs text-muted-foreground mb-2">Choose how paused time is handled in sessions.</p>
            <RadioGroup
              value={settings.pause_mode}
              onValueChange={(v) => persist({ ...settings, pause_mode: v })}
              className="space-y-2"
            >
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="deduct" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Deduct breaks</p>
                  <p className="text-xs text-muted-foreground">Paused time is subtracted from your session duration. Only working time is saved.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="track" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Track breaks separately</p>
                  <p className="text-xs text-muted-foreground">Paused time is saved alongside your session. Break patterns appear in Reports.</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Timer Sound */}
          <div>
            <Label className="text-sm font-semibold">Timer Completion Sound</Label>
            <p className="text-xs text-muted-foreground mb-2">Sound played when a Focus session ends.</p>
            <div className="flex items-center gap-2">
              <Select value={settings.timer_sound} onValueChange={(v) => persist({ ...settings, timer_sound: v })}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chime">Default chime</SelectItem>
                  <SelectItem value="bell">Bell</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
              {settings.timer_sound === "none" ? (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Volume2 className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Theme */}
          <div>
            <Label className="text-sm font-semibold">Appearance</Label>
            <div className="flex gap-2 mt-2">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => persist({ ...settings, theme: t })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    settings.theme === t
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>

          {/* Integrations placeholder */}
          <div>
            <Label className="text-sm font-semibold">Integrations</Label>
            <p className="text-xs text-muted-foreground mb-2">Connect Trace with your other tools.</p>
            <div className="grid grid-cols-3 gap-2">
              {INTEGRATION_LOGOS.map((int) => (
                <div key={int.name} className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border opacity-50">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {int.icon}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{int.name}</span>
                  <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Coming soon</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
