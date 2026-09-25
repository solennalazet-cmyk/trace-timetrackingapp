import { useState, useEffect, useCallback, useRef } from "react";
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
import WorkerNotificationsCard from "@/components/WorkerNotificationsCard";
import SessionConflictDialog from "@/components/SessionConflictDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { toLocalDateKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { saveAnonymousEntry, getAnonymousEntries, updateAnonymousEntry } from "@/lib/anonymous-store";
import { toast } from "sonner";
import { getCongratsMessage } from "@/lib/boost-challenges";
import { makeSessionEntryKey, makeTimeEntryIdempotencyKey } from "@/lib/time-entry-idempotency";
import GeolocationPrePromptModal from "@/components/GeolocationPrePromptModal";
import Seo from "@/components/Seo";
import {
  requestLocation,
  evaluateOnSite,
  cacheStartLocation,
  readStartLocation,
  clearStartLocation,
  type CapturedLocation,
} from "@/lib/geolocation";

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

// NOTE: this used to be "trace_pending_assignment", which is also the
// anonymous-store key that `migrateAnonymousData` reads as a *time entry* and
// then deletes. That collision blew up the sign-in migration and destroyed the
// pending recap. Own key, own shape.
const PENDING_SESSION_LS_KEY = "trace_pending_session_v2";
const LAST_MODE_LS_KEY = "trace_last_mode";
const LEGACY_PENDING_SESSION_LS_KEY = "trace_pending_assignment";
/** After this long an unresolved recap is auto-filed to Unassigned Work. */
const PENDING_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type PendingAssignmentSnapshot = {
  session: SessionData;
  editingEntry: ExistingEntry | null;
  savedAt?: number;
  /** Set once the user pressed Save: the save is retried, never re-asked. */
  assignment?: AssignmentResult | null;
  assignments?: AssignmentResult[];
  /** Set once the user closed the recap: file to Unassigned on retry. */
  skipped?: boolean;
  /** Choices to pre-fill after a failed save. */
  draft?: AssignmentResult | null;
};

const isSaveInProgress = (s: PendingAssignmentSnapshot) =>
  !!s.skipped || s.assignment != null || (s.assignments?.length ?? 0) > 0;

// Module-level so a remount can't start a second copy of the same save.
let pendingSaveInFlight = false;

function parseSnapshot(key: string): PendingAssignmentSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Guard against the legacy key holding an anonymous *entry* object.
    if (!parsed?.session || typeof parsed.session.durationMinutes !== "number") return null;
    return parsed as PendingAssignmentSnapshot;
  } catch {
    return null;
  }
}

function readPendingSnapshot(): PendingAssignmentSnapshot | null {
  return parseSnapshot(PENDING_SESSION_LS_KEY) ?? parseSnapshot(LEGACY_PENDING_SESSION_LS_KEY);
}

function writePendingSnapshot(snap: PendingAssignmentSnapshot) {
  try {
    localStorage.setItem(
      PENDING_SESSION_LS_KEY,
      JSON.stringify({ ...snap, savedAt: snap.savedAt ?? Date.now() })
    );
  } catch {}
}

function clearPendingSnapshot() {
  try {
    localStorage.removeItem(PENDING_SESSION_LS_KEY);
    // Only drop the legacy key if it actually holds one of our snapshots.
    if (parseSnapshot(LEGACY_PENDING_SESSION_LS_KEY)) {
      localStorage.removeItem(LEGACY_PENDING_SESSION_LS_KEY);
    }
  } catch {}
}


const StartPage = () => {
  const [mode, setMode] = useState<Mode>(() => {
    // Remember the tab across remounts so a tap on "Clock In" isn't undone by
    // the page re-mounting underneath the user.
    const active = getActiveMode();
    if (active) return active;
    try {
      const saved = localStorage.getItem(LAST_MODE_LS_KEY);
      if (saved === "stopwatch" || saved === "focus" || saved === "shift") return saved;
    } catch {}
    return "stopwatch";
  });

  useEffect(() => {
    try { localStorage.setItem(LAST_MODE_LS_KEY, mode); } catch {}
  }, [mode]);

  const { user, profile, loading: authLoading } = useAuth();
  const { activeRole } = useRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [todayCount, setTodayCount] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [singleUnassignedEntry, setSingleUnassignedEntry] = useState<ExistingEntry | null>(null);
  const [showSummary, setShowSummary] = useState(true);

  // Boost mode
  const isBoost = searchParams.get("boost") === "1";
  const [boostProjectId, setBoostProjectId] = useState<string | null>(null);

  // Assignment modal state — rehydrate from LS so an unexpected unmount
  // (role-guard flicker, token refresh, reload) can't destroy a pending
  // clock-out recap. If a snapshot exists on mount, reopen the modal.
  // A snapshot whose save is already in progress is finished in the
  // background (see effect below) — it must not reopen the recap.
  const reopenSnap = () => {
    const s = readPendingSnapshot();
    return s && !isSaveInProgress(s) ? s : null;
  };
  const [assignModalOpen, setAssignModalOpen] = useState(() => !!reopenSnap());
  const [pendingSession, setPendingSession] = useState<SessionData | null>(() => reopenSnap()?.session ?? null);
  const [editingEntry, setEditingEntry] = useState<ExistingEntry | null>(() => reopenSnap()?.editingEntry ?? null);
  const [recapDraft, setRecapDraft] = useState<AssignmentResult | null>(() => reopenSnap()?.draft ?? null);

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

  // Geolocation
  const [geoMode, setGeoMode] = useState<"off" | "ask" | "always">("off");
  const [geoPromptSeen, setGeoPromptSeen] = useState(true);
  const [geoPrePromptOpen, setGeoPrePromptOpen] = useState(false);
  const [pendingGeoStart, setPendingGeoStart] = useState<{ mode: string; startedAt: string } | null>(null);
  const profileRole = (profile as any)?.active_role;

  useEffect(() => {
    // Don't redirect away while a pending assignment recap is open — losing
    // this page would destroy the modal and the session before the user can
    // save. The RoleContext still switches; we just stay put until the modal
    // is resolved (save / skip / dismiss all save to Unassigned).
    if (assignModalOpen || pendingSession) return;
    if (activeRole === "employer" || profileRole === "employer") {
      navigate("/employer", { replace: true });
    }
  }, [activeRole, profileRole, navigate, assignModalOpen, pendingSession]);

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
          const nowIso = new Date().toISOString();
          const elapsed = parsed.pausedAt
            ? new Date(parsed.pausedAt).getTime() - startMs - pausedMs
            : Date.now() - startMs - pausedMs;
          const durationMinutes = Math.max(1, Math.round(elapsed / 60000));
          const breakMinutes = Math.round(pausedMs / 60000);
          // Close any open pause interval so break data isn't lost.
          const rawIntervals: { paused_at: string; resumed_at: string | null }[] =
            Array.isArray(parsed.pauseIntervals) ? parsed.pauseIntervals : [];
          const pauseIntervals =
            rawIntervals.length > 0 && rawIntervals[rawIntervals.length - 1].resumed_at == null
              ? [...rawIntervals.slice(0, -1), { ...rawIntervals[rawIntervals.length - 1], resumed_at: nowIso }]
              : rawIntervals;
          localStorage.removeItem(key);
          // Open assignment modal for this session
          const entryType = conflictActiveMode === "shift" ? "shift" : "timer";
          const nextSession: SessionData = {
            durationMinutes,
            breakMinutes,
            startedAt: parsed.startedAt,
            endedAt: nowIso,
            entryType,
            pauseIntervals,
            idempotencyKey: makeTimeEntryIdempotencyKey("timer", user?.id ?? "anonymous", conflictActiveMode, parsed.startedAt ?? "no-start"),
          };
          setEditingEntry(null);
          setPendingSession(nextSession);
          // Same persistence contract as a normal stop — an unmount here must
          // not lose the session.
          writePendingSnapshot({ session: nextSession, editingEntry: null });
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

      const { data: unassignedEntries, count } = await supabase
        .from("time_entries")
        .select("id, entry_type, duration_minutes, break_minutes, entry_date, notes, tags, billable, rate_amount, rate_currency, rate_unit, client_id, project_id, task_id, start_time, end_time", { count: "exact" })
        .eq("user_id", user.id)
        .is("client_id", null)
        .is("project_id", null)
        .is("deleted_at", null)
        .order("entry_date", { ascending: false })
        .limit(1);
      setUnassignedCount(count ?? 0);
      setSingleUnassignedEntry(count === 1 && unassignedEntries?.[0] ? unassignedEntries[0] as ExistingEntry : null);
    } else {
      const entries = getAnonymousEntries();
      const todayEntries = entries.filter((e: any) => e.entry_date === today);
      setTodayCount(todayEntries.length);
      setTodayMinutes(todayEntries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0));
      const unassignedEntries = entries.filter((e: any) => !e.client_id && !e.project_id);
      setUnassignedCount(unassignedEntries.length);
      setSingleUnassignedEntry(unassignedEntries.length === 1 ? unassignedEntries[0] as ExistingEntry : null);
    }
  };

  useEffect(() => { fetchSummary(); }, [user]);

  // Load show_logged_today + geolocation settings
  useEffect(() => {
    const loadSetting = async () => {
      if (user) {
        const { data } = await supabase
          .from("user_settings")
          .select("show_logged_today, geolocation_mode, geolocation_prompt_seen")
          .eq("user_id", user.id)
          .single();
        if (data) {
          setShowSummary(data.show_logged_today ?? true);
          setGeoMode(((data as any).geolocation_mode ?? "off") as "off" | "ask" | "always");
          setGeoPromptSeen(((data as any).geolocation_prompt_seen ?? false) as boolean);
        }
      } else {
        try {
          const raw = localStorage.getItem("trace_user_settings");
          if (raw) {
            const parsed = JSON.parse(raw);
            setShowSummary(parsed.show_logged_today ?? true);
            setGeoMode((parsed.geolocation_mode ?? "off") as "off" | "ask" | "always");
            setGeoPromptSeen(parsed.geolocation_prompt_seen ?? false);
          }
        } catch {}
      }
    };
    loadSetting();
  }, [user]);

  // Capture location when timer starts
  const captureStart = useCallback(async (sessionMode: string, startedAt: string) => {
    const loc = await requestLocation();
    if (loc) cacheStartLocation(sessionMode, startedAt, loc);
  }, []);

  // Listen for timer start events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: string; startedAt: string };
      if (!detail) return;
      if (geoMode === "off") return;
      // First-time pre-prompt
      if (!geoPromptSeen) {
        setPendingGeoStart(detail);
        setGeoPrePromptOpen(true);
        return;
      }
      captureStart(detail.mode, detail.startedAt);
    };
    window.addEventListener("trace-timer-started", handler as EventListener);
    return () => window.removeEventListener("trace-timer-started", handler as EventListener);
  }, [geoMode, geoPromptSeen, captureStart]);

  const markPromptSeen = useCallback(async (mode: "off" | "ask" | "always") => {
    setGeoPromptSeen(true);
    setGeoMode(mode);
    if (user) {
      await supabase.from("user_settings").upsert(
        { user_id: user.id, geolocation_prompt_seen: true, geolocation_mode: mode } as any,
        { onConflict: "user_id" }
      );
    } else {
      try {
        const raw = localStorage.getItem("trace_user_settings");
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.geolocation_prompt_seen = true;
        parsed.geolocation_mode = mode;
        localStorage.setItem("trace_user_settings", JSON.stringify(parsed));
      } catch {}
    }
  }, [user]);

  // Called when timer stops — opens the assignment modal
  const handleSessionEnd = async (
    data: { durationMinutes: number; breakMinutes: number; startedAt: string | null; pauseIntervals?: { paused_at: string; resumed_at: string | null }[]; idempotencyKey?: string },
    entryType: string = "timer"
  ) => {
    console.log(`[StartPage] handleSessionEnd called, entryType=${entryType}, duration=${data.durationMinutes}min`);
    if (data.durationMinutes <= 0) {
      data.durationMinutes = 1;
    }
    const endedAt = new Date().toISOString();

    // Boost sessions: auto-save with Growth project and show congrats
    if (isBoost && boostProjectId && user) {
      const now = new Date();
      await supabase.from("time_entries").upsert({
        user_id: user.id,
        idempotency_key: data.idempotencyKey ?? makeTimeEntryIdempotencyKey("boost", user.id, data.startedAt ?? "no-start"),
        duration_minutes: data.durationMinutes,
        break_minutes: data.breakMinutes,
        entry_type: "boost",
        entry_date: toLocalDateKey(data.startedAt ? new Date(data.startedAt) : now),
        project_id: boostProjectId,
        billable: false,
        start_time: data.startedAt || null,
        end_time: data.startedAt ? endedAt : null,
        pause_intervals: data.pauseIntervals ?? [],
      } as any, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
      toast.success(getCongratsMessage());
      // Clear boost param
      setSearchParams({});
      fetchSummary();
      return;
    }

    setEditingEntry(null);
    const nextSession: SessionData = { ...data, entryType, endedAt };
    setPendingSession(nextSession);
    // Persist immediately so a mid-flow unmount (role flicker, reload,
    // crash) can rehydrate the recap on next mount instead of losing it.
    writePendingSnapshot({ session: nextSession, editingEntry: null, savedAt: Date.now() });
    console.log(`[StartPage] assignment modal opened for ${entryType}`);
    setAssignModalOpen(true);
  };


  // Save entry with assignment data
  const saveEntry = async (session: SessionData, assignment: AssignmentResult | null, segment: string = "single") => {
    const now = new Date();
    const hasRate = assignment?.rateAmount != null;
    const hasBillableValue = assignment?.billableValue != null;
    const ownerId = user?.id ?? "anonymous";
    // Anchor the entry to when the work actually happened, not to when the
    // recap happened to be resolved. A session recovered after a reload (or
    // a shift that crossed midnight) must keep its own date and end time.
    const startedDate = session.startedAt ? new Date(session.startedAt) : null;
    const validStart = startedDate && !isNaN(startedDate.getTime()) ? startedDate : null;
    const endedDate = session.endedAt ? new Date(session.endedAt) : null;
    const validEnd =
      endedDate && !isNaN(endedDate.getTime())
        ? endedDate
        : validStart
        ? new Date(validStart.getTime() + (session.durationMinutes + (session.breakMinutes || 0)) * 60000)
        : null;
    const entry: any = {
      idempotency_key: makeSessionEntryKey(ownerId, session, segment),
      duration_minutes: session.durationMinutes,
      break_minutes: session.breakMinutes,
      entry_type: session.entryType,
      entry_date: toLocalDateKey(validStart ?? now),
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
      start_time: validStart ? validStart.toISOString() : null,
      end_time: validStart && validEnd ? validEnd.toISOString() : null,
      pause_intervals: session.pauseIntervals ?? [],
    };


    // ── Geolocation capture ──
    // Read cached start fix (set when timer started), capture end fix now.
    let clientSite: { site_lat: number | null; site_lng: number | null; site_radius_m: number | null; geolocation_override: string | null } | null = null;
    if (user && assignment?.clientId) {
      const { data: c } = await supabase
        .from("clients")
        .select("site_lat, site_lng, site_radius_m, geolocation_override")
        .eq("id", assignment.clientId)
        .single();
      clientSite = (c as any) ?? null;
    }
    const clientOverride = (clientSite?.geolocation_override ?? "inherit") as "inherit" | "always" | "never";
    const shouldCapture =
      clientOverride === "always" ||
      (clientOverride !== "never" && geoMode !== "off");

    if (shouldCapture) {
      const startLoc: CapturedLocation | null = readStartLocation(session.entryType ?? "timer", session.startedAt);
      // Hard cap: a GPS fix that never answers (backgrounded webview, pending
      // permission prompt) must never hold the save hostage.
      const endLoc: CapturedLocation | null = await Promise.race([
        requestLocation().catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);

      if (startLoc) {
        entry.start_lat = startLoc.lat;
        entry.start_lng = startLoc.lng;
        entry.start_accuracy_m = startLoc.accuracy_m;
        if (clientSite) {
          const ev = evaluateOnSite(startLoc, clientSite);
          if (ev) { entry.start_on_site = ev.on_site; entry.start_distance_m = ev.distance_m; }
        }
      }
      if (endLoc) {
        entry.end_lat = endLoc.lat;
        entry.end_lng = endLoc.lng;
        entry.end_accuracy_m = endLoc.accuracy_m;
        if (clientSite) {
          const ev = evaluateOnSite(endLoc, clientSite);
          if (ev) { entry.end_on_site = ev.on_site; entry.end_distance_m = ev.distance_m; }
        }
      }
      if (!startLoc && !endLoc && geoMode !== "off") {
        toast("Location unavailable — entry saved without it.");
      }
      clearStartLocation(session.entryType ?? "timer");
    }

    if (user) {
      const { error } = await supabase
      // An assigned save must win over an earlier unassigned copy of the same
      // session (e.g. filed by a dismiss or recovery), so merge on conflict.
        .from("time_entries")
        .upsert({ ...entry, user_id: user.id }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: !assignment });
      if (error) throw error;
    } else {
      saveAnonymousEntry(entry);
    }
    window.dispatchEvent(new CustomEvent("trace-entries-changed"));
  };

  const updateEntry = async (entry: ExistingEntry, assignment: AssignmentResult) => {
    if (user) {
      const shouldResetBilling =
        entry.client_id !== assignment.clientId ||
        entry.project_id !== assignment.projectId ||
        entry.task_id !== assignment.taskId ||
        (entry.billable ?? true) !== assignment.billable ||
        entry.rate_amount !== assignment.rateAmount ||
        (entry.rate_currency ?? "EUR") !== assignment.rateCurrency ||
        (entry.rate_unit ?? null) !== (assignment.rateAmount != null ? assignment.rateUnit : null);

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
      }).eq("id", entry.id);
      if (error) throw error;
    } else {
      const updated = updateAnonymousEntry(entry.id, {
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
        billing_status: "unbilled",
        invoice_id: null,
      }, (entry as any)?.idempotency_key ?? null);
      if (!updated) throw new Error("Entry not found");
    }
  };

  // Close the recap right away and finish the write in the background.
  // The user's choices are written to the pending snapshot *before* the
  // recap closes, so a remount mid-save (auth refresh, role flicker, app
  // backgrounded) retries the same save silently instead of reopening an
  // empty recap. If the write truly fails, the recap comes back pre-filled.
  const closeRecap = () => {
    setAssignModalOpen(false);
    setPendingSession(null);
    setEditingEntry(null);
    setRecapDraft(null);
  };

  const restoreRecap = (session: SessionData, entry: ExistingEntry | null, draft: AssignmentResult | null) => {
    writePendingSnapshot({ session, editingEntry: entry, draft });
    setPendingSession(session);
    setEditingEntry(entry);
    setRecapDraft(draft);
    setAssignModalOpen(true);
    toast.error("Couldn't save yet. Your choices are kept — tap Save again.");
  };

  const persistAssignment = async (snap: PendingAssignmentSnapshot): Promise<string> => {
    const { session, editingEntry: entry, assignment, assignments } = snap;
    if (entry && assignment) {
      await updateEntry(entry, assignment);
      return "Entry updated.";
    }
    if (assignments && assignments.length > 0) {
      for (const [index, a] of assignments.entries()) {
        const dur = (a as any)._durationMinutes ?? session.durationMinutes;
        await saveEntry({ ...session, durationMinutes: dur }, a, a.taskId ?? `task-${index}`);
      }
      return `${assignments.length} tasks saved.`;
    }
    if (user) {
      // Best effort only — a failure here must never block the save.
      try {
        const { data: staleSession } = await supabase
          .from("active_sessions").select("id").eq("user_id", user.id).maybeSingle();
        if (staleSession) await supabase.from("active_sessions").delete().eq("user_id", user.id);
      } catch { /* ignore */ }
    }
    await saveEntry(session, assignment ?? null);
    return session.entryType === "shift" ? "Shift saved." : "Entry saved.";
  };

  const runPendingSave = async (snap: PendingAssignmentSnapshot) => {
    if (pendingSaveInFlight) return;
    pendingSaveInFlight = true;
    try {
      const msg = await persistAssignment(snap);
      clearPendingSnapshot();
      toast.success(msg);
      fetchSummary();
    } catch (error) {
      console.error("Save failed:", error);
      restoreRecap(snap.session, snap.editingEntry, snap.assignment ?? snap.assignments?.[0] ?? null);
    } finally {
      pendingSaveInFlight = false;
    }
  };

  const handleAssignSave = async (session: SessionData, assignment: AssignmentResult) => {
    const snap: PendingAssignmentSnapshot = { session, editingEntry, assignment };
    writePendingSnapshot(snap);
    closeRecap();
    await runPendingSave(snap);
  };

  const handleAssignSaveMulti = async (session: SessionData, assignments: AssignmentResult[]) => {
    const snap: PendingAssignmentSnapshot = { session, editingEntry: null, assignments };
    writePendingSnapshot(snap);
    closeRecap();
    await runPendingSave(snap);
  };

  const handleAssignSkip = async (session: SessionData) => {
    const entryBeingEdited = editingEntry;
    closeRecap();
    if (entryBeingEdited) {
      // Closing an edit of an existing entry leaves it exactly as it was.
      clearPendingSnapshot();
      return;
    }
    const snap: PendingAssignmentSnapshot = { session, editingEntry: null, assignment: null, skipped: true };
    writePendingSnapshot(snap);
    if (pendingSaveInFlight) return;
    pendingSaveInFlight = true;
    try {
      await saveEntry(session, null);
      clearPendingSnapshot();
      toast.success("Session saved to Unassigned Work.");
      fetchSummary();
    } catch (error) {
      console.error("Save failed:", error);
      restoreRecap(session, null, null);
    } finally {
      pendingSaveInFlight = false;
    }
  };

  // Finish a save that was interrupted by a remount/reload.
  useEffect(() => {
    if (authLoading || (user && !profile)) return;
    const snap = readPendingSnapshot();
    if (snap && isSaveInProgress(snap)) {
      if (snap.skipped) {
        void handleAssignSkip(snap.session);
      } else {
        void runPendingSave(snap);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, profile]);


  // ── Recovery safety net ─────────────────────────────────────────────
  // A rehydrated recap that can't be shown (employer role) or that has been
  // sitting around unresolved for hours must never be lost: file it to
  // Unassigned Work exactly once, then release the page.
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (user && !profile) return;
    if (!pendingSession || editingEntry) return;
    if (recoveredRef.current) return;

    const snap = readPendingSnapshot();
    const savedAt = snap?.savedAt ?? 0;
    const isStale = savedAt > 0 && Date.now() - savedAt > PENDING_MAX_AGE_MS;
    const isEmployerView = activeRole === "employer" || profileRole === "employer";
    if (!isStale && !isEmployerView) return;

    recoveredRef.current = true;
    (async () => {
      try {
        await saveEntry(pendingSession, null);
        toast.success("Unfinished session saved to Unassigned Work.");
      } catch (error) {
        console.error("[StartPage] pending session recovery failed:", error);
        recoveredRef.current = false;
        return;
      }
      setAssignModalOpen(false);
      setPendingSession(null);
      clearPendingSnapshot();
      fetchSummary();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, profile, activeRole, profileRole, pendingSession, editingEntry]);

  // Handle assigning from unassigned panel
  const handleAssignFromPanel = (entry: any) => {
    const existing = entry as ExistingEntry;
    const nextSession: SessionData = {
      durationMinutes: entry.duration_minutes,
      breakMinutes: entry.break_minutes ?? 0,
      startedAt: null,
      entryType: entry.entry_type ?? "timer",
    };
    setEditingEntry(existing);
    setPendingSession(nextSession);
    writePendingSnapshot({ session: nextSession, editingEntry: existing });
    setAssignModalOpen(true);
  };

  const handleUnassignedClick = () => {
    if (unassignedCount === 1 && singleUnassignedEntry) {
      handleAssignFromPanel(singleUnassignedEntry);
      return;
    }
    setUnassignedOpen(true);
  };

  const modes: { key: Mode; label: string }[] = [
    { key: "stopwatch", label: "Stopwatch" },
    { key: "focus", label: "Focus" },
    { key: "shift", label: "Clock In" },
  ];

  // Don't show the Loading… fallback while a pending recap modal is open —
  // unmounting the tree here is exactly what destroyed the clock-out modal
  // before. Keep the page mounted so the modal survives role flicker.
  // Auth itself is the one exception: saving while `user` is still resolving
  // would write the entry to the anonymous store instead of the account.
  const hasPending = assignModalOpen || !!pendingSession;
  if (authLoading || (!hasPending && ((user && !profile) || activeRole === "employer" || profileRole === "employer"))) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground px-4">Loading…</div>;
  }


  return (
    <div className="flex flex-col items-center pt-4">
      <Seo title={"Trace — Time Tracker for Freelancers"} description={"Start a timer in one tap and assign work to clients later. Trace is the timer-first time tracking app for freelancers."} path={"/"} />
      <h1 className="sr-only">Time Tracker</h1>
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

      {/* Report review and payment notifications */}
      <WorkerNotificationsCard />




      {/* Summary cards */}
      {showSummary && (
        <SummaryCards
          todayCount={todayCount}
          todayMinutes={todayMinutes}
          unassignedCount={unassignedCount}
          onTodayClick={() => setTodaySheetOpen(true)}
          onUnassignedClick={handleUnassignedClick}
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
        draft={recapDraft}
        onSave={handleAssignSave}
        onSaveMulti={handleAssignSaveMulti}
        onSkip={handleAssignSkip}
        onDelete={async (entryId) => {
          await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entryId);
          toast("Entry deleted.");
          setAssignModalOpen(false);
          setEditingEntry(null);
          setPendingSession(null);
          clearPendingSnapshot();
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
        onBatchAssigned={fetchSummary}
      />

      {/* Today's Entries Sheet */}
      <TodayEntriesSheet
        open={todaySheetOpen}
        onOpenChange={setTodaySheetOpen}
        onEntryTap={(entry) => {
          setTodaySheetOpen(false);
          const existing = entry as ExistingEntry;
          const nextSession: SessionData = {
            durationMinutes: entry.duration_minutes,
            breakMinutes: entry.break_minutes ?? 0,
            startedAt: null,
            entryType: entry.entry_type ?? "timer",
          };
          setEditingEntry(existing);
          setPendingSession(nextSession);
          writePendingSnapshot({ session: nextSession, editingEntry: existing });
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

      {/* Geolocation pre-prompt (first session only) */}
      <GeolocationPrePromptModal
        open={geoPrePromptOpen}
        onOpenChange={setGeoPrePromptOpen}
        onEnable={async () => {
          setGeoPrePromptOpen(false);
          await markPromptSeen("ask");
          if (pendingGeoStart) {
            captureStart(pendingGeoStart.mode, pendingGeoStart.startedAt);
            setPendingGeoStart(null);
          }
        }}
        onDecline={async () => {
          setGeoPrePromptOpen(false);
          await markPromptSeen("off");
          setPendingGeoStart(null);
        }}
      />
    </div>
  );
};

export default StartPage;
