import { supabase } from "@/integrations/supabase/client";
import {
  getAnonymousEntries,
  getAnonymousClients,
  getAnonymousProjects,
  getAnonymousTasks,
  getPendingAssignment,
} from "@/lib/anonymous-store";
import { makeTimeEntryIdempotencyKey } from "@/lib/time-entry-idempotency";

export const migrateAnonymousData = async (userId: string) => {
  const clientIdMap: Record<string, string> = {};
  const projectIdMap: Record<string, string> = {};
  const taskIdMap: Record<string, string> = {};

  // 1. Migrate clients
  const anonClients = getAnonymousClients();
  if (anonClients.length > 0) {
    const { data, error } = await supabase.from("clients").insert(
      anonClients.map((c: any) => ({
        name: c.name,
        email: c.email,
        nif: c.nif,
        currency: c.currency,
        default_rate: c.default_rate,
        user_id: userId,
      }))
    ).select("id");
    if (error) throw error;
    data?.forEach((row, index) => {
      if (anonClients[index]?.id) clientIdMap[anonClients[index].id] = row.id;
    });
  }

  // 2. Migrate projects
  const anonProjects = getAnonymousProjects();
  if (anonProjects.length > 0) {
    const { data, error } = await supabase.from("projects").insert(
      anonProjects.map((p: any) => ({
        name: p.name,
        rate: p.rate,
        currency: p.currency,
        client_id: p.client_id ? (clientIdMap[p.client_id] ?? null) : null,
        user_id: userId,
      }))
    ).select("id");
    if (error) throw error;
    data?.forEach((row, index) => {
      if (anonProjects[index]?.id) projectIdMap[anonProjects[index].id] = row.id;
    });
  }

  // 3. Migrate tasks
  const anonTasks = getAnonymousTasks();
  if (anonTasks.length > 0) {
    const { data, error } = await supabase.from("tasks").insert(
      anonTasks.map((t: any) => ({
        name: t.name,
        user_id: userId,
      }))
    ).select("id");
    if (error) throw error;
    data?.forEach((row, index) => {
      if (anonTasks[index]?.id) taskIdMap[anonTasks[index].id] = row.id;
    });
  }

  // 4. Migrate time entries
  const anonEntries = getAnonymousEntries();
  if (anonEntries.length > 0) {
    const { error } = await supabase.from("time_entries").upsert(
      anonEntries.map((e: any, index: number) => ({
        ...e,
        client_id: e.client_id ? (clientIdMap[e.client_id] ?? null) : null,
        project_id: e.project_id ? (projectIdMap[e.project_id] ?? null) : null,
        task_id: e.task_id ? (taskIdMap[e.task_id] ?? null) : null,
        user_id: userId,
        idempotency_key: e.idempotency_key ?? makeTimeEntryIdempotencyKey("anonymous-migration", userId, e.entry_type, e.start_time, e.entry_date, e.duration_minutes, index),
        id: undefined, // let DB generate
      })),
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  // 5. Migrate pending assignment
  const pending = getPendingAssignment();
  if (pending) {
    const { error } = await supabase.from("time_entries").upsert({
      ...pending,
      client_id: pending.client_id ? (clientIdMap[pending.client_id] ?? null) : null,
      project_id: pending.project_id ? (projectIdMap[pending.project_id] ?? null) : null,
      task_id: pending.task_id ? (taskIdMap[pending.task_id] ?? null) : null,
      user_id: userId,
      idempotency_key: pending.idempotency_key ?? makeTimeEntryIdempotencyKey("pending-assignment", userId, pending.entry_type, pending.start_time, pending.entry_date, pending.duration_minutes),
      id: undefined,
      billing_status: "unbilled",
    }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
    if (error) throw error;
  }

  // 6. Clear anonymous data (except active timers)
  const keysToRemove = [
    "trace_anonymous_entries",
    "trace_anonymous_clients",
    "trace_anonymous_projects",
    "trace_anonymous_tasks",
    "trace_pending_assignment",
  ];
  keysToRemove.forEach((key) => localStorage.removeItem(key));
};
