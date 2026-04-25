/**
 * Anonymous (localStorage) data store for unauthenticated users.
 * On sign-in, this data gets migrated to Supabase.
 */

const KEYS = {
  entries: "trace_anonymous_entries",
  clients: "trace_anonymous_clients",
  projects: "trace_anonymous_projects",
  tasks: "trace_anonymous_tasks",
  activeStopwatch: "trace_active_stopwatch",
  activeShift: "trace_active_shift",
  pendingAssignment: "trace_pending_assignment",
} as const;

// Keys that must NEVER be cleared except on explicit user action (stop/discard)
const PROTECTED_KEYS: Set<string> = new Set([KEYS.activeStopwatch, KEYS.activeShift]);

function getItem<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function removeItem(key: string): void {
  localStorage.removeItem(key);
}

// Time entries
export function getAnonymousEntries() {
  return getItem<any[]>(KEYS.entries) ?? [];
}
export function saveAnonymousEntry(entry: any) {
  const entries = getAnonymousEntries();
  entries.push(entry);
  setItem(KEYS.entries, entries);
}

// Clients
export function getAnonymousClients() {
  return getItem<any[]>(KEYS.clients) ?? [];
}
export function saveAnonymousClient(client: any) {
  const clients = getAnonymousClients();
  const idx = clients.findIndex((c: any) => c.id === client.id);
  if (idx >= 0) clients[idx] = { ...clients[idx], ...client };
  else clients.push(client);
  setItem(KEYS.clients, clients);
}
export function deleteAnonymousClient(clientId: string) {
  // Delete the client, all its projects, and all entries assigned to it (or its projects)
  const projects = getAnonymousProjects();
  const projectIds = new Set(projects.filter((p: any) => p.client_id === clientId).map((p: any) => p.id));
  setItem(KEYS.clients, getAnonymousClients().filter((c: any) => c.id !== clientId));
  setItem(KEYS.projects, projects.filter((p: any) => p.client_id !== clientId));
  setItem(KEYS.entries, getAnonymousEntries().filter((e: any) => e.client_id !== clientId && !projectIds.has(e.project_id)));
}

// Projects
export function getAnonymousProjects() {
  return getItem<any[]>(KEYS.projects) ?? [];
}
export function saveAnonymousProject(project: any) {
  const projects = getAnonymousProjects();
  const idx = projects.findIndex((p: any) => p.id === project.id);
  if (idx >= 0) projects[idx] = { ...projects[idx], ...project };
  else projects.push(project);
  setItem(KEYS.projects, projects);
}

// Tasks
export function getAnonymousTasks() {
  return getItem<any[]>(KEYS.tasks) ?? [];
}
export function saveAnonymousTask(task: any) {
  const tasks = getAnonymousTasks();
  tasks.push(task);
  setItem(KEYS.tasks, tasks);
}

// Active stopwatch
export interface ActiveTimer {
  startedAt: string;
  pausedAt: string | null;
  totalPausedMs: number;
}
export function getActiveStopwatch(): ActiveTimer | null {
  return getItem<ActiveTimer>(KEYS.activeStopwatch);
}
export function setActiveStopwatch(timer: ActiveTimer | null) {
  if (timer) setItem(KEYS.activeStopwatch, timer);
  else removeItem(KEYS.activeStopwatch);
}

// Active shift
export function getActiveShift(): ActiveTimer | null {
  return getItem<ActiveTimer>(KEYS.activeShift);
}
export function setActiveShift(timer: ActiveTimer | null) {
  if (timer) setItem(KEYS.activeShift, timer);
  else removeItem(KEYS.activeShift);
}

// Pending assignment
export function getPendingAssignment() {
  return getItem<any>(KEYS.pendingAssignment);
}
export function setPendingAssignment(entry: any | null) {
  if (entry) setItem(KEYS.pendingAssignment, entry);
  else removeItem(KEYS.pendingAssignment);
}

// Clear all anonymous data (after migration) — never clears active timer sessions
export function clearAllAnonymousData() {
  Object.values(KEYS).forEach((key) => {
    if (!PROTECTED_KEYS.has(key)) removeItem(key);
  });
}
