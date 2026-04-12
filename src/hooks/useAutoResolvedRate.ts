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

  const logDebug = (event: string, details: Record<string, unknown>) => {
    if (!debug) {
      return;
    }

    console.log(`[${debugLabel}] ${event}`, details);
  };

  useEffect(() => {
    if (!enabled) {
      requestKeyRef.current += 1;
      logDebug("disabled", {
        selectedClientId: clientId || null,
        selectedProjectId: projectId || null,
        initialEditSkipActive: skip,
      });
      return;
    }

    if (skip) {
      requestKeyRef.current += 1;
      logDebug("skip-initial-hydration", {
        selectedClientId: clientId || null,
        selectedProjectId: projectId || null,
        initialEditSkipActive: skip,
      });
      return;
    }

    const requestKey = ++requestKeyRef.current;

    logDebug("resolve-start", {
      selectedClientId: clientId || null,
      selectedProjectId: projectId || null,
      initialEditSkipActive: skip,
      requestKey,
    });

    onReset();
    logDebug("rate-reset", {
      selectedClientId: clientId || null,
      selectedProjectId: projectId || null,
      initialEditSkipActive: skip,
      rateWasReset: true,
      requestKey,
    });

    if (!clientId && !projectId) {
      logDebug("resolve-complete", {
        selectedClientId: null,
        selectedProjectId: null,
        initialEditSkipActive: skip,
        source: "null",
        requestKey,
      });
      return;
    }

    if (!userId) {
      const selectedProject = projects.find((project) => project.id === projectId);
      const selectedClient = clients.find((client) => client.id === clientId);

      if (selectedProject?.rate != null) {
        logDebug("resolve-complete", {
          selectedClientId: clientId || null,
          selectedProjectId: projectId || null,
          initialEditSkipActive: skip,
          source: "project",
          requestKey,
        });
        onResolved({
          amount: String(selectedProject.rate),
          currency: selectedProject.currency ?? selectedClient?.currency ?? "EUR",
        });
        return;
      }

      if (selectedClient?.default_rate != null) {
        logDebug("resolve-complete", {
          selectedClientId: clientId || null,
          selectedProjectId: projectId || null,
          initialEditSkipActive: skip,
          source: "client",
          requestKey,
        });
        onResolved({
          amount: String(selectedClient.default_rate),
          currency: selectedClient.currency ?? "EUR",
        });
        return;
      }

      logDebug("resolve-complete", {
        selectedClientId: clientId || null,
        selectedProjectId: projectId || null,
        initialEditSkipActive: skip,
        source: "null",
        requestKey,
      });

      return;
    }

    resolveRate(clientId || null, projectId || null, userId)
      .then((rate) => {
        if (requestKeyRef.current !== requestKey) {
          logDebug("stale-result-ignored", {
            selectedClientId: clientId || null,
            selectedProjectId: projectId || null,
            initialEditSkipActive: skip,
            source: rate.source,
            requestKey,
          });
          return;
        }

        logDebug("resolve-complete", {
          selectedClientId: clientId || null,
          selectedProjectId: projectId || null,
          initialEditSkipActive: skip,
          source: rate.source,
          requestKey,
        });

        if (rate.amount == null) {
          return;
        }

        onResolved({ amount: String(rate.amount), currency: rate.currency });
      })
      .catch((error) => {
        logDebug("resolve-error", {
          selectedClientId: clientId || null,
          selectedProjectId: projectId || null,
          initialEditSkipActive: skip,
          requestKey,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      if (requestKeyRef.current === requestKey) {
        requestKeyRef.current += 1;
      }
    };
  }, [
    enabled,
    skip,
    clientId,
    projectId,
    userId,
    clients,
    projects,
    onReset,
    onResolved,
    debug,
    debugLabel,
  ]);
}