import { useEffect, useRef } from "react";

import { resolveRate } from "@/lib/resolve-rate";

interface RateLookupClient {
  id: string;
  default_rate: number | null;
  currency: string | null;
}

interface RateLookupProject {
  id: string;
  rate: number | null;
  currency: string | null;
}

interface UseAutoResolvedRateOptions {
  enabled: boolean;
  clientId: string;
  projectId: string;
  userId?: string;
  clients: RateLookupClient[];
  projects: RateLookupProject[];
  skip?: boolean;
  onReset: () => void;
  onResolved: (rate: { amount: string; currency: string }) => void;
  debug?: boolean;
  debugLabel?: string;
}

/**
 * Fills the rate field from the selected project/client.
 *
 * Two rules keep the field trustworthy while the user is typing:
 * 1. It only re-runs when the *selection* changes — a background refresh of the
 *    clients/projects lists can never wipe what is in the field.
 * 2. It resolves from the already-loaded lists first (instant) and only asks the
 *    backend when the in-memory copy has no rate.
 */
export function useAutoResolvedRate({
  enabled,
  clientId,
  projectId,
  userId,
  clients,
  projects,
  skip = false,
  onReset,
  onResolved,
  debug = false,
  debugLabel = "useAutoResolvedRate",
}: UseAutoResolvedRateOptions) {
  const requestKeyRef = useRef(0);

  // Latest values kept in refs so list refreshes / new callback identities do
  // not retrigger the effect (which used to clear a rate mid-typing).
  const clientsRef = useRef(clients);
  const projectsRef = useRef(projects);
  const onResetRef = useRef(onReset);
  const onResolvedRef = useRef(onResolved);
  clientsRef.current = clients;
  projectsRef.current = projects;
  onResetRef.current = onReset;
  onResolvedRef.current = onResolved;

  const logDebug = (event: string, details: Record<string, unknown>) => {
    if (!debug) return;
    console.log(`[${debugLabel}] ${event}`, details);
  };

  useEffect(() => {
    if (!enabled || skip) {
      requestKeyRef.current += 1;
      return;
    }

    const requestKey = ++requestKeyRef.current;

    onResetRef.current();

    if (!clientId && !projectId) {
      logDebug("resolve-complete", { source: "null", requestKey });
      return;
    }

    // 1. Instant resolution from what is already in memory.
    const selectedProject = projectsRef.current.find((project) => project.id === projectId);
    const selectedClient = clientsRef.current.find((client) => client.id === clientId);

    if (selectedProject?.rate != null) {
      logDebug("resolve-complete", { source: "project-local", requestKey });
      onResolvedRef.current({
        amount: String(selectedProject.rate),
        currency: selectedProject.currency ?? selectedClient?.currency ?? "EUR",
      });
      return;
    }

    if (selectedClient?.default_rate != null) {
      logDebug("resolve-complete", { source: "client-local", requestKey });
      onResolvedRef.current({
        amount: String(selectedClient.default_rate),
        currency: selectedClient.currency ?? "EUR",
      });
      return;
    }

    if (!userId) {
      logDebug("resolve-complete", { source: "null", requestKey });
      return;
    }

    // 2. Fall back to the backend when memory has nothing.
    resolveRate(clientId || null, projectId || null, userId)
      .then((rate) => {
        if (requestKeyRef.current !== requestKey) {
          logDebug("stale-result-ignored", { source: rate.source, requestKey });
          return;
        }
        logDebug("resolve-complete", { source: rate.source, requestKey });
        if (rate.amount == null) return;
        onResolvedRef.current({ amount: String(rate.amount), currency: rate.currency });
      })
      .catch((error) => {
        logDebug("resolve-error", {
          requestKey,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [enabled, skip, clientId, projectId, userId]);
}
