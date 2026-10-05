import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useDismissedNotifications, REJECT_ALERT_CUTOFF } from "@/hooks/useDismissedNotifications";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const REJECT_LABELS: Record<string, string> = {
  missing_session: "Missing session",
  incorrect_hours: "Incorrect hours",
  incorrect_information: "Incorrect information",
  other: "Other",
};

interface Event {
  id: string;
  ts: string; // ISO
  type: "approved" | "rejected";
  clientName: string;
  amount?: number;
  currency?: string;
  reason?: string | null;
  note?: string | null;
}


/**
 * Worker-side notifications: surfaces approved/rejected reports since the user last
 * dismissed. Payments from the other side are never notified.
 */
const WorkerNotificationsCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const { dismissed, loaded, dismiss } = useDismissedNotifications();

  const load = useCallback(async () => {
    if (!user) return;

    // Payments recorded by the other side are private: no payment notices here.
    const { data: rRows } = await supabase
      .from("submitted_reports")
      .select("id, client_id, status, reviewed_at, rejection_reason, rejection_note, total_amount, currency, notify_worker")
      .eq("worker_user_id", user.id)
      .in("status", ["approved", "rejected"])
      .not("reviewed_at", "is", null)
      .not("employer_user_id", "is", null)
      .neq("employer_user_id", user.id)
      .order("reviewed_at", { ascending: false })
      .limit(10);

    const reportRows = (rRows ?? []) as any[];
    const clientIds = Array.from(new Set(reportRows.map((r) => r.client_id))).filter(Boolean);

    let nameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: cRows } = await supabase.from("clients").select("id, name").in("id", clientIds);
      nameMap = new Map(((cRows ?? []) as any[]).map((c) => [c.id, c.name as string]));
    }

    const evts: Event[] = [];
    for (const r of reportRows) {
      // Employers can reject quietly — those reviews raise no notification.
      if (r.notify_worker === false) continue;
      // Approvals raise no card — the report's label on Payments shows it.
      if (r.status === "approved") continue;
      // Same rule as Payments: no alerts for rejections before the feature launched.
      if (!r.reviewed_at || Date.parse(r.reviewed_at) < REJECT_ALERT_CUTOFF) continue;
      evts.push({
        id: r.id,
        ts: r.reviewed_at,
        type: r.status === "approved" ? "approved" : "rejected",
        clientName: nameMap.get(r.client_id) ?? "Client",
        amount: Number(r.total_amount),
        currency: r.currency,
        reason: r.rejection_reason,
        note: r.rejection_note,
      });
    }
    evts.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    setEvents(evts);
  }, [user]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("trace-notifications-changed", handler);
    return () => window.removeEventListener("trace-notifications-changed", handler);
  }, [load]);

  const unread = useMemo(
    () => (loaded ? events.filter((e) => !dismissed.includes(e.id)).slice(0, 5) : []),
    [events, dismissed, loaded],
  );

  if (!user || unread.length === 0) return null;

  const dismissAll = () => { void dismiss(unread.map((e) => e.id)); };

  return (
    <div className="space-y-2 mt-4">
      {unread.map((e) => {
        const sym = CURRENCY_SYMBOLS[e.currency ?? "EUR"] ?? "€";
        let Icon = Check;
        let title = "";
        let body = "";

        if (e.type === "approved") {
          Icon = Check;
          title = `${e.clientName} approved your report`;
          body = `${sym}${(e.amount ?? 0).toFixed(2)} · awaiting payment`;
        } else if (e.type === "rejected") {
          Icon = AlertCircle;
          title = `${e.clientName} rejected your report`;
          const reasonLabel = e.reason ? REJECT_LABELS[e.reason] ?? e.reason : "See details";
          body = e.note ? `${reasonLabel} — ${e.note}` : reasonLabel;
        }

        return (
          <Card key={e.id} className="p-4 bg-card border-border shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
                {e.type === "rejected" && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      className="rounded-full h-8 px-4 gap-1"
                      onClick={() => navigate("/reports")}
                    >
                      Review &amp; edit
                    </Button>
                  </div>
                )}
              </div>
              <button
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground p-1 -mr-1"
                onClick={() => { void dismiss([e.id]); }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </Card>
        );
      })}

      {unread.length > 1 && (
        <button
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          onClick={dismissAll}
        >
          Dismiss all
        </button>
      )}
    </div>
  );
};

export default WorkerNotificationsCard;
