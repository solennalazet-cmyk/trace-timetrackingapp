/**
 * Lightweight local cache for the client / project / task lists used by the
 * assignment recap. The recap used to show an empty combobox until three
 * network round-trips finished; now we paint the last known lists instantly
 * and refresh them in the background.
 */

export interface AssignmentCachePayload {
  clients: Array<{ id: string; name: string; default_rate: number | null; currency: string | null }>;
  projects: Array<{ id: string; name: string; client_id: string | null; rate: number | null; currency: string | null }>;
  tasks: Array<{ id: string; name: string; project_id: string | null; client_id: string | null }>;
  tags: string[];
}

const KEY_PREFIX = "trace_assignment_cache_v1:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export const readAssignmentCache = (userId: string | undefined): AssignmentCachePayload | null => {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: AssignmentCachePayload };
    if (!parsed?.data || Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

export const writeAssignmentCache = (userId: string | undefined, data: AssignmentCachePayload) => {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* quota / private mode — cache is best-effort */
  }
};
