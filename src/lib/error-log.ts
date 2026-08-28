import { isChunkLoadError } from "./chunk-recovery";

const STORAGE_KEY = "trace_error_log";
const MAX_ENTRIES = 50;

export interface TraceErrorEntry {
  at: string;
  message: string;
  stack?: string;
  route?: string;
  source: "window" | "promise" | "boundary" | "manual";
}

function read(): TraceErrorEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TraceErrorEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: TraceErrorEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {}
}

export function getErrorLog(): TraceErrorEntry[] {
  return read();
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  dispatch();
}

function dispatch() {
  try {
    window.dispatchEvent(new Event("trace-error-logged"));
  } catch {}
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function logError(error: unknown, source: TraceErrorEntry["source"] = "manual"): void {
  if (typeof window === "undefined") return;
  // Chunk-load failures are already handled by the auto-reload recovery path.
  if (isChunkLoadError(error)) return;

  const message = toMessage(error);
  if (!message) return;

  const entry: TraceErrorEntry = {
    at: new Date().toISOString(),
    message: message.slice(0, 500),
    stack: error instanceof Error && error.stack ? error.stack.slice(0, 2000) : undefined,
    route: window.location?.pathname,
    source,
  };

  const entries = read();
  const last = entries[0];
  // Collapse identical errors fired in a tight loop.
  if (last && last.message === entry.message && Date.now() - new Date(last.at).getTime() < 2000) return;

  write([entry, ...entries]);
  dispatch();
}

export function getDiagnosticsContext(extra?: Record<string, unknown>) {
  if (typeof window === "undefined") return { ...extra };
  return {
    route: window.location?.pathname,
    url: window.location?.href,
    userAgent: navigator?.userAgent,
    language: navigator?.language,
    online: navigator?.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    loggedAt: new Date().toISOString(),
    recentErrors: getErrorLog().slice(0, 5),
    ...extra,
  };
}

export function formatErrorLogForCopy(): string {
  const entries = getErrorLog();
  if (entries.length === 0) return "No errors recorded.";
  return entries
    .map(
      (e) =>
        `[${e.at}] (${e.source}) ${e.route ?? ""}\n${e.message}${e.stack ? `\n${e.stack}` : ""}`,
    )
    .join("\n\n---\n\n");
}

let installed = false;

export function installGlobalErrorCapture(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    logError(event.error ?? event.message, "window");
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError(event.reason, "promise");
  });
}
