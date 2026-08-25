const CHUNK_RELOAD_KEY = "trace:chunk-reload-attempted-at";
const RELOAD_COOLDOWN_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|ChunkLoadError|Load failed/i.test(
    message,
  );
}

function canReloadForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  try {
    const lastAttempt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
    const now = Date.now();

    if (now - lastAttempt < RELOAD_COOLDOWN_MS) return false;

    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

export function clearChunkReloadMarker(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {}
}

export function recoverFromChunkLoadError(error: unknown): boolean {
  if (!isChunkLoadError(error) || !canReloadForChunkError()) return false;

  window.location.reload();
  return true;
}

export function installChunkLoadRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    recoverFromChunkLoadError(event);
  });
}