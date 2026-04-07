import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { useAuth } from "@/contexts/AuthContext";
import { toLocalDateKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { saveAnonymousEntry, getAnonymousEntries } from "@/lib/anonymous-store";
import { toast } from "sonner";

type Mode = "stopwatch" | "focus" | "shift";

const StartPage = () => {
  const [mode, setMode] = useState<Mode>("stopwatch");
  const { user } = useAuth();
  const navigate = useNavigate();

  const [todayCount, setTodayCount] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [showSummary, setShowSummary] = useState(true);

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
  const handleSessionEnd = (
    data: { durationMinutes: number; breakMinutes: number; startedAt: string | null },
    entryType: string = "timer"
  ) => {
    if (data.durationMinutes <= 0) {
      data.durationMinutes = 1;
    }
    setEditingEntry(null);
    setPendingSession({ ...data, entryType });
    setAssignModalOpen(true);
  };

  // Save entry with assignment data
  const saveEntry = async (session: SessionData, assignment: AssignmentResult | null) => {
    const entry: any = {
      duration_minutes: session.durationMinutes,
      break_minutes: session.breakMinutes,
      entry_type: session.entryType,
      entry_date: toLocalDateKey(new Date()),
      billable: assignment?.billable ?? true,
      billing_status: "unbilled",
      client_id: assignment?.clientId || null,
      project_id: assignment?.projectId || null,
      task_id: assignment?.taskId || null,
      notes: assignment?.notes || null,
      tags: assignment?.tags?.length ? assignment.tags : null,
      rate_amount: assignment?.rateAmount || null,
      rate_currency: assignment?.rateCurrency || null,
      rate_unit: assignment?.rateAmount ? (assignment?.rateUnit || "hour") : null,
      billable_value: assignment?.billableValue || null,
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
      const { error } = await supabase.from("time_entries").update({
        client_id: assignment.clientId,
        project_id: assignment.projectId,
        task_id: assignment.taskId,
        notes: assignment.notes || null,
        tags: assignment.tags.length ? assignment.tags : null,
        billable: assignment.billable,
        rate_amount: assignment.rateAmount,
        rate_currency: assignment.rateCurrency,
        rate_unit: assignment.rateAmount ? assignment.rateUnit : null,
        billable_value: assignment.billableValue,
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
        await saveEntry(session, assignment);
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
    { key: "shift", label: "Shift" },
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
            onClick={() => setMode(m.key)}
            className="px-5 py-2 text-sm font-medium transition-colors"
            style={{
              borderRadius: 20,
              background: mode === m.key ? "hsl(var(--primary))" : "transparent",
              color: mode === m.key ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Timer area */}
      {mode === "stopwatch" && <StopwatchMode onStop={(d) => handleSessionEnd(d, "timer")} />}
      {mode === "focus" && <FocusMode onComplete={(d) => handleSessionEnd(d, "timer")} />}
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
        onSkip={handleAssignSkip}
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
    </div>
  );
};

export default StartPage;
