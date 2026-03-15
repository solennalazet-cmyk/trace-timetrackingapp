import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StopwatchMode from "@/components/StopwatchMode";
import FocusMode from "@/components/FocusMode";
import ShiftMode from "@/components/ShiftMode";
import SummaryCards from "@/components/SummaryCards";
import FAB from "@/components/FAB";
import SignInLink from "@/components/SignInLink";
import { useAuth } from "@/contexts/AuthContext";
import FocusMode from "@/components/FocusMode";
import ShiftMode from "@/components/ShiftMode";
import SummaryCards from "@/components/SummaryCards";
import FAB from "@/components/FAB";
import { useAuth } from "@/contexts/AuthContext";
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

  // Fetch summary data
  useEffect(() => {
    const fetchSummary = async () => {
      const today = new Date().toISOString().split("T")[0];

      if (user) {
        const { data: todayEntries } = await supabase
          .from("time_entries")
          .select("duration_minutes")
          .eq("user_id", user.id)
          .eq("entry_date", today);

        setTodayCount(todayEntries?.length ?? 0);
        setTodayMinutes(
          todayEntries?.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) ?? 0
        );

        const { count } = await supabase
          .from("time_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("client_id", null)
          .is("project_id", null);

        setUnassignedCount(count ?? 0);
      } else {
        const entries = getAnonymousEntries();
        const todayEntries = entries.filter(
          (e: any) => e.entry_date === today
        );
        setTodayCount(todayEntries.length);
        setTodayMinutes(
          todayEntries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
        );
        const unassigned = entries.filter(
          (e: any) => !e.client_id && !e.project_id
        );
        setUnassignedCount(unassigned.length);
      }
    };

    fetchSummary();
  }, [user]);

  const handleSessionEnd = async (data: {
    durationMinutes: number;
    breakMinutes: number;
    startedAt: string | null;
  }, entryType: string = "timer") => {
    if (data.durationMinutes <= 0) {
      toast.success("Session too short to save.");
      return;
    }

    const entry = {
      duration_minutes: data.durationMinutes,
      break_minutes: data.breakMinutes,
      entry_type: entryType,
      entry_date: new Date().toISOString().split("T")[0],
      billable: true,
      billing_status: "unbilled" as const,
    };

    if (user) {
      await supabase.from("time_entries").insert({
        ...entry,
        user_id: user.id,
      });
    } else {
      saveAnonymousEntry(entry);
    }

    toast.success("Session saved to Unassigned Work.");

    // Refresh summary
    setTodayCount((c) => c + 1);
    setTodayMinutes((m) => m + data.durationMinutes);
    setUnassignedCount((c) => c + 1);
  };

  const modes: { key: Mode; label: string }[] = [
    { key: "stopwatch", label: "Stopwatch" },
    { key: "focus", label: "Focus" },
    { key: "shift", label: "Shift" },
  ];

  return (
    <div className="flex flex-col items-center pt-4">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 mb-6">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === m.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Timer area */}
      {mode === "stopwatch" && (
        <StopwatchMode onStop={(d) => handleSessionEnd(d, "timer")} />
      )}
      {mode === "focus" && (
        <FocusMode onComplete={(d) => handleSessionEnd(d, "timer")} />
      )}
      {mode === "shift" && (
        <ShiftMode onClockOut={(d) => handleSessionEnd(d, "shift")} />
      )}

      {/* Summary cards */}
      <SummaryCards
        todayCount={todayCount}
        todayMinutes={todayMinutes}
        unassignedCount={unassignedCount}
        onTodayClick={() => navigate("/reports")}
        onUnassignedClick={() => {/* TODO: open unassigned panel */}}
      />

      {/* FAB */}
      <FAB
        onManualEntry={() => {/* TODO: open manual entry modal */}}
        onLogCall={() => {/* TODO: open call log modal */}}
      />
    </div>
  );
};

export default StartPage;
