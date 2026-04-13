import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import StopwatchMode from "@/components/StopwatchMode";
import FocusMode from "@/components/FocusMode";
import ShiftMode from "@/components/ShiftMode";
import SummaryCards from "@/components/SummaryCards";
import FAB from "@/components/FAB";
import SignInLink from "@/components/SignInLink";
import AssignmentModal, { SessionData, AssignmentResult, ExistingEntry } from "@/components/AssignmentModal";
import ManualEntryModal from "@/components/ManualEntryModal";
import CallLogModal from "@/components/CallLogModal";
import UnassignedPanel from "@/components/UnassignedPanel";
import TodayEntriesSheet from "@/components/TodayEntriesSheet";
import WelcomeBanner from "@/components/WelcomeBanner";
import SessionConflictDialog from "@/components/SessionConflictDialog";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { saveAnonymousEntry, getAnonymousEntries } from "@/lib/anonymous-store";
import { toast } from "sonner";
import { getCongratsMessage } from "@/lib/boost-challenges";

type Mode = "stopwatch" | "focus" | "shift";

const LS_KEYS: Record<string, string> = {
  stopwatch: "trace_active_stopwatch",
  shift: "trace_active_shift",
  focus: "trace_active_focus",
};

function getActiveMode(): Mode | null {
  for (const [mode, key] of Object.entries(LS_KEYS)) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.startedAt) return mode as Mode;
      }
    } catch {}
  }
  return null;
}

const StartPage = () => {
  const [mode, setMode] = useState<Mode>("stopwatch");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [todayCount, setTodayCount] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [showSummary, setShowSummary] = useState(true);

  // Boost mode
  const isBoost = searchParams.get("boost") === "1";
  const [boostProjectId, setBoostProjectId] = useState<string | null>(null);

  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionData | null>(null);
  const [editingEntry, setEditingEntry] = useState<ExistingEntry | null>(null);

  // Manual entry & call log modals
  const [manualOpen, setManualOpen] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);

  // Unassigned panel
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [todaySheetOpen, setTodaySheetOpen] = useState(false);

  // Session conflict dialog
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictActiveMode, setConflictActiveMode] = useState<Mode>("stopwatch");
  const [conflictTargetMode, setConflictTargetMode] = useState<Mode>("stopwatch");

  const handleModeSwitch = (target: Mode) => {
    if (target === mode) return;
    const active = getActiveMode();
    if (active && active !== target) {
      setConflictActiveMode(active);
      setConflictTargetMode(target);
      setConflictOpen(true);
      return;
    }
    setMode(target);
  };

  const handleConflictAction = (action: "clock-out" | "discard" | "cancel") => {
    setConflictOpen(false);
    if (action === "cancel") return;

    // Clear the active session from localStorage
    const key = LS_KEYS[conflictActiveMode];
    if (action === "clock-out") {
      // Read current state, compute duration, and trigger save
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const startMs = new Date(parsed.startedAt).getTime();
          const pausedMs = parsed.totalPausedMs || 0;
          const elapsed = parsed.pausedAt
            ? new Date(parsed.pausedAt).getTime() - startMs - pausedMs
            : Date.now() - startMs - pausedMs;
          const durationMinutes = Math.max(1, Math.round(elapsed / 60000));
          const breakMinutes = Math.round(pausedMs / 60000);
          localStorage.removeItem(key);
          // Open assignment modal for this session
          const entryType = conflictActiveMode === "shift" ? "shift" : "timer";
          setEditingEntry(null);
          setPendingSession({ durationMinutes, breakMinutes, startedAt: parsed.startedAt, entryType });
          setAssignModalOpen(true);
        }
      } catch {
        localStorage.removeItem(key);
      }
    } else {
      // Discard: just remove the session
      localStorage.removeItem(key);
      toast("Session discarded.");
    }

    // Clean up Supabase active session if authenticated
    if (user) {
      supabase.from("active_sessions").delete().eq("user_id", user.id).then();
    }

    setMode(conflictTargetMode);
  };

  // Handle boost mode: switch to Focus and create Growth project
  useEffect(() => {
    if (!isBoost) return;
    setMode("focus");

    const ensureGrowthProject = async () => {
      if (!user) return;
      // Check if Growth project exists
      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", "Growth")
        .maybeSingle();
      if (existing) {
        setBoostProjectId(existing.id);
      } else {
        const { data: created } = await supabase
          .from("projects")
          .insert({ user_id: user.id, name: "Growth" })
          .select("id")
          .single();
        if (created) setBoostProjectId(created.id);
      }
    };
    ensureGrowthProject();
  }, [isBoost, user]);


  const fetchSummary = async () => {
    const today = toLocalDateKey(new Date());
    if (user) {
      const { data: todayEntries } = await supabase
        .from("time_entries")
        .select("duration_minutes")
        .eq("user_id", user.id)
        .eq("entry_date", today)
        .is("deleted_at", null);
      setTodayCount(todayEntries?.length ?? 0);
      setTodayMinutes(todayEntries?.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) ?? 0);

      const { count } = await supabase
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("client_id", null)
        .is("project_id", null)
        .is("deleted_at", null);
      setUnassignedCount(count ?? 0);
    } else {
      const entries = getAnonymousEntries();
      const todayEntries = entries.filter((e: any) => e.entry_date === today);
      setTodayCount(todayEntries.length);
      setTodayMinutes(todayEntries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0));
      setUnassignedCount(entries.filter((e: any) => !e.client_id && !e.project_id).length);
    }
  };

  useEffect(() => { fetchSummary(); }, [user]);

  // Load show_logged_today setting
  useEffect(() => {
    const loadSetting = async () => {
      if (user) {
        const { data } = await supabase
          .from("user_settings")
          .select("show_logged_today")
          .eq("user_id", user.id)
          .single();
        if (data) setShowSummary(data.show_logged_today ?? true);
      } else {
        try {
          const raw = localStorage.getItem("trace_user_settings");
          if (raw) {
            const parsed = JSON.parse(raw);
            setShowSummary(parsed.show_logged_today ?? true);
          }
        } catch {}
      }
    };
    loadSetting();
  }, [user]);

  // Called when timer stops — opens the assignment modal
  const handleSessionEnd = async (
    data: { durationMinutes: number; breakMinutes: number; startedAt: string | null },
    entryType: string = "timer"
  ) => {
    console.log(`[StartPage] handleSessionEnd called, entryType=${entryType}, duration=${data.durationMinutes}min`);
    if (data.durationMinutes <= 0) {
      data.durationMinutes = 1;
    }

    // Boost sessions: auto-save with Growth project and show congrats
    if (isBoost && boostProjectId && user) {
      const now = new Date();
      await supabase.from("time_entries").insert({
        user_id: user.id,
        duration_minutes: data.durationMinutes,
        break_minutes: data.breakMinutes,
        entry_type: "boost",
        entry_date: toLocalDateKey(now),
        project_id: boostProjectId,
        billable: false,
        start_time: data.startedAt || null,
        end_time: data.startedAt ? now.toISOString() : null,
      });
      toast.success(getCongratsMessage());
      // Clear boost param
      setSearchParams({});
      fetchSummary();
      return;
    }

    setEditingEntry(null);
    setPendingSession({ ...data, entryType });
    console.log(`[StartPage] assignment modal opened for ${entryType}`);
    setAssignModalOpen(true);
  };

  // Save entry with assignment data
  const saveEntry = async (session: SessionData, assignment: AssignmentResult | null) => {
    const now = new Date();
    const hasRate = assignment?.rateAmount != null;
    const hasBillableValue = assignment?.billableValue != null;
    const entry: any = {
      duration_minutes: session.durationMinutes,
      break_minutes: session.breakMinutes,
      entry_type: session.entryType,
      entry_date: toLocalDateKey(now),
      billable: assignment?.billable ?? true,
      billing_status: "unbilled",
      client_id: assignment?.clientId || null,
      project_id: assignment?.projectId || null,
      task_id: assignment?.taskId || null,
      notes: assignment?.notes || null,
      tags: assignment?.tags?.length ? assignment.tags : null,
      rate_amount: hasRate ? assignment?.rateAmount : null,
      rate_currency: assignment?.rateCurrency || null,
      rate_unit: hasRate ? (assignment?.rateUnit || "hour") : null,
      billable_value: hasBillableValue ? assignment?.billableValue : null,
      start_time: session.startedAt || null,
      end_time: session.startedAt ? now.toISOString() : null,
    };

    if (user) {
      const { error } = await supabase.from("time_entries").insert({ ...entry, user_id: user.id });
      if (error) throw error;
    } else {
      saveAnonymousEntry(entry);
    }
  };

  const updateEntry = async (entryId: string, assignment: AssignmentResult) => {
    if (user) {
      const shouldResetBilling =
        editingEntry?.client_id !== assignment.clientId ||
        editingEntry?.project_id !== assignment.projectId ||
        editingEntry?.task_id !== assignment.taskId ||
        (editingEntry?.billable ?? true) !== assignment.billable ||
        editingEntry?.rate_amount !== assignment.rateAmount ||
        (editingEntry?.rate_currency ?? "EUR") !== assignment.rateCurrency ||
        (editingEntry?.rate_unit ?? null) !== (assignment.rateAmount != null ? assignment.rateUnit : null);

      const { error } = await supabase.from("time_entries").update({
        client_id: assignment.clientId,
        project_id: assignment.projectId,
        task_id: assignment.taskId,
        notes: assignment.notes || null,
        tags: assignment.tags.length ? assignment.tags : null,
        billable: assignment.billable,
        rate_amount: assignment.rateAmount,
        rate_currency: assignment.rateCurrency,
        rate_unit: assignment.rateAmount != null ? assignment.rateUnit : null,
        billable_value: assignment.billableValue,
        ...(shouldResetBilling ? { billing_status: "unbilled", invoice_id: null } : {}),
      }).eq("id", entryId);
      if (error) throw error;
    }
  };

  const handleAssignSave = async (session: SessionData, assignment: AssignmentResult) => {
    try {
      if (editingEntry) {
        await updateEntry(editingEntry.id, assignment);
        toast.success("Entry updated.");
      } else {
        console.log(`[StartPage] time entry save started, type=${session.entryType}`);
        // Verify no stale active session exists before saving
        if (user) {
          const { data: staleSession } = await supabase
            .from("active_sessions")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (staleSession) {
            console.warn(`[StartPage] stale active_session found after stop! Cleaning up before save.`);
            await supabase.from("active_sessions").delete().eq("user_id", user.id);
          }
        }
        await saveEntry(session, assignment);
        console.log(`[StartPage] time entry save succeeded`);
        const label = session.entryType === "shift" ? "Shift saved." : "Entry saved.";
        toast.success(label);
      }
      setAssignModalOpen(false);
      setPendingSession(null);
      setEditingEntry(null);
      fetchSummary();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Something went wrong. Your session is safe — try again.");
    }
  };

  const handleAssignSaveMulti = async (session: SessionData, assignments: AssignmentResult[]) => {
    try {
      for (const assignment of assignments) {
        const dur = (assignment as any)._durationMinutes ?? session.durationMinutes;
        await saveEntry({ ...session, durationMinutes: dur }, assignment);
      }
      toast.success(`${assignments.length} tasks saved.`);
      setAssignModalOpen(false);
      setPendingSession(null);
      setEditingEntry(null);
      fetchSummary();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Something went wrong. Your session is safe — try again.");
    }
  };

  const handleAssignSkip = async (session: SessionData) => {
    try {
      if (!editingEntry) {
        await saveEntry(session, null);
      }
      setAssignModalOpen(false);
      setPendingSession(null);
      setEditingEntry(null);
      toast.success("Session saved to Unassigned Work.");
      fetchSummary();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Something went wrong. Your session is safe — try again.");
    }
  };

  // Handle assigning from unassigned panel
  const handleAssignFromPanel = (entry: any) => {
    setEditingEntry(entry as ExistingEntry);
    setPendingSession({
      durationMinutes: entry.duration_minutes,
      breakMinutes: entry.break_minutes ?? 0,
      startedAt: null,
      entryType: entry.entry_type ?? "timer",
    });
    setAssignModalOpen(true);
  };

  const modes: { key: Mode; label: string }[] = [
    { key: "stopwatch", label: "Stopwatch" },
    { key: "focus", label: "Focus" },
    { key: "shift", label: "Clock In" },
  ];

  return (
    <div className="flex flex-col items-center pt-4">
      {/* Mode toggle */}
      <div
        className="flex mb-6"
        style={{
          border: "1px solid hsl(var(--border))",
          borderRadius: 24,
          padding: 3,
        }}
      >
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => handleModeSwitch(m.key)}
            className="px-5 py-2 text-sm font-medium transition-colors"
            style={{
              borderRadius: 20,
              background: mode === m.key ? "hsl(var(--primary))" : "transparent",
              color: mode === m.key ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Timer area */}
      {mode === "stopwatch" && <StopwatchMode onStop={(d) => handleSessionEnd(d, "timer")} />}
      {mode === "focus" && <FocusMode onComplete={(d) => handleSessionEnd(d, isBoost ? "boost" : "timer")} autoStartMinutes={isBoost ? 15 : undefined} />}
      {mode === "shift" && <ShiftMode onClockOut={(d) => handleSessionEnd(d, "shift")} />}

      {/* Welcome banner (first visit only) */}
      <WelcomeBanner onDismiss={() => {}} />

      {/* Summary cards */}
      {showSummary && (
        <SummaryCards
          todayCount={todayCount}
          todayMinutes={todayMinutes}
          unassignedCount={unassignedCount}
          onTodayClick={() => setTodaySheetOpen(true)}
          onUnassignedClick={() => setUnassignedOpen(true)}
        />
      )}

      <SignInLink />

      <FAB
        onManualEntry={() => setManualOpen(true)}
        onLogCall={() => setCallLogOpen(true)}
      />

      {/* Assignment Modal */}
      <AssignmentModal
        open={assignModalOpen}
        session={pendingSession}
        existingEntry={editingEntry}
        onSave={handleAssignSave}
        onSaveMulti={handleAssignSaveMulti}
        onSkip={handleAssignSkip}
        onDelete={async (entryId) => {
          await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entryId);
          toast("Entry deleted.");
          setAssignModalOpen(false);
          setEditingEntry(null);
          fetchSummary();
        }}
      />

      {/* Manual Entry Modal */}
      <ManualEntryModal
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSaved={fetchSummary}
      />

      {/* Call Log Modal */}
      <CallLogModal
        open={callLogOpen}
        onOpenChange={setCallLogOpen}
        onSaved={fetchSummary}
      />

      {/* Unassigned Work Panel */}
      <UnassignedPanel
        open={unassignedOpen}
        onOpenChange={setUnassignedOpen}
        onAssignEntry={handleAssignFromPanel}
        onCountChange={setUnassignedCount}
      />

      {/* Today's Entries Sheet */}
      <TodayEntriesSheet
        open={todaySheetOpen}
        onOpenChange={setTodaySheetOpen}
        onEntryTap={(entry) => {
          setTodaySheetOpen(false);
          setEditingEntry(entry as any);
          setPendingSession({
            durationMinutes: entry.duration_minutes,
            breakMinutes: entry.break_minutes ?? 0,
            startedAt: null,
            entryType: entry.entry_type ?? "timer",
          });
          setAssignModalOpen(true);
        }}
      />

      {/* Session Conflict Dialog */}
      <SessionConflictDialog
        open={conflictOpen}
        activeMode={conflictActiveMode}
        targetMode={conflictTargetMode}
        onAction={handleConflictAction}
      />
    </div>
  );
};

export default StartPage;
