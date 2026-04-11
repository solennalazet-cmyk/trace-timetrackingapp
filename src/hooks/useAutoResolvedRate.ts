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
}: UseAutoResolvedRateOptions) {
  const requestKeyRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      requestKeyRef.current += 1;
      return;
    }

    if (skip) {
      return;
    }

    const requestKey = ++requestKeyRef.current;
    onReset();

    if (!clientId && !projectId) {
      return;
    }

    if (!userId) {
      const selectedProject = projects.find((project) => project.id === projectId);
      const selectedClient = clients.find((client) => client.id === clientId);

      if (selectedProject?.rate != null) {
        onResolved({
          amount: String(selectedProject.rate),
          currency: selectedProject.currency ?? selectedClient?.currency ?? "EUR",
        });
        return;
      }

      if (selectedClient?.default_rate != null) {
        onResolved({
          amount: String(selectedClient.default_rate),
          currency: selectedClient.currency ?? "EUR",
        });
      }

      return;
    }

    resolveRate(clientId || null, projectId || null, userId)
      .then((rate) => {
        if (requestKeyRef.current !== requestKey || rate.amount == null) {
          return;
        }

        onResolved({ amount: String(rate.amount), currency: rate.currency });
      })
      .catch(() => {
        // Keep the cleared state if lookup fails.
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
  ]);
}