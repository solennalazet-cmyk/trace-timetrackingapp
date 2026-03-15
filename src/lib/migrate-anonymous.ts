import { supabase } from "@/integrations/supabase/client";
import {
  getAnonymousEntries,
  getAnonymousClients,
  getAnonymousProjects,
  getAnonymousTasks,
  getPendingAssignment,
} from "@/lib/anonymous-store";

export const migrateAnonymousData = async (userId: string) => {
  // 1. Migrate clients
  const anonClients = getAnonymousClients();
  if (anonClients.length > 0) {
    await supabase.from("clients").insert(
      anonClients.map((c: any) => ({
        name: c.name,
        email: c.email,
        nif: c.nif,
        currency: c.currency,
        default_rate: c.default_rate,
        user_id: userId,
      }))
    );
  }

  // 2. Migrate projects
  const anonProjects = getAnonymousProjects();
  if (anonProjects.length > 0) {
    await supabase.from("projects").insert(
      anonProjects.map((p: any) => ({
        name: p.name,
        rate: p.rate,
        currency: p.currency,
        user_id: userId,
      }))
    );
  }

  // 3. Migrate tasks
  const anonTasks = getAnonymousTasks();
  if (anonTasks.length > 0) {
    await supabase.from("tasks").insert(
      anonTasks.map((t: any) => ({
        name: t.name,
        user_id: userId,
      }))
    );
  }

  // 4. Migrate time entries
  const anonEntries = getAnonymousEntries();
  if (anonEntries.length > 0) {
    await supabase.from("time_entries").insert(
      anonEntries.map((e: any) => ({
        ...e,
        user_id: userId,
        id: undefined, // let DB generate
      }))
    );
  }

  // 5. Migrate pending assignment
  const pending = getPendingAssignment();
  if (pending) {
    await supabase.from("time_entries").insert({
      ...pending,
      user_id: userId,
      id: undefined,
      billing_status: "unbilled",
    });
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
