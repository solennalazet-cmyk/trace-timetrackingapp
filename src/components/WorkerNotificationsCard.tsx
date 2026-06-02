import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Wallet, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

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
  type: "approved" | "rejected" | "payment";
  clientName: string;
  amount?: number;
  currency?: string;
  reason?: string | null;
  note?: string | null;
}

const seenKey = (uid: string) => `trace-notifs-seen-${uid}`;

/**
 * Worker-side notifications: surfaces approved/rejected reports and
 * incoming payments since the user last dismissed.
 */
const WorkerNotificationsCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [seenAt, setSeenAt] = useState<number>(0);

  const load = useCallback(async () => {
    if (!user) return;
    setSeenAt(Number(localStorage.getItem(seenKey(user.id)) ?? 0));

    const [{ data: rRows }, { data: pRows }] = await Promise.all([
      supabase
        .from("submitted_reports")
        .select("id, client_id, status, reviewed_at, rejection_reason, rejection_note, total_amount, currency")
        .eq("worker_user_id", user.id)
        .in("status", ["approved", "rejected"])
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: false })
        .limit(10),
      supabase
        .from("report_payments")
        .select("id, submitted_report_id, amount, currency, created_at, recorded_by_user_id")
        .neq("recorded_by_user_id", user.id) // payments WE recorded shouldn't notify us
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const reportRows = (rRows ?? []) as any[];
    const paymentRows = (pRows ?? []) as any[];

    // Resolve client names — for payments we need to look up the report → client
    const reportIdsFromPayments = Array.from(new Set(paymentRows.map((p) => p.submitted_report_id)));
    let paymentReportMap = new Map<string, { client_id: string }>();
    if (reportIdsFromPayments.length > 0) {
      const { data: prRows } = await supabase
        .from("submitted_reports")
        .select("id, client_id")
        .in("id", reportIdsFromPayments);
      paymentReportMap = new Map(((prRows ?? []) as any[]).map((r) => [r.id, { client_id: r.client_id }]));
    }

    const clientIds = Array.from(new Set([
      ...reportRows.map((r) => r.client_id),
      ...Array.from(paymentReportMap.values()).map((v) => v.client_id),
    ])).filter(Boolean);

    let nameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: cRows } = await supabase.from("clients").select("id, name").in("id", clientIds);
      nameMap = new Map(((cRows ?? []) as any[]).map((c) => [c.id, c.name as string]));
    }

    const evts: Event[] = [];
    for (const r of reportRows) {
      evts.push({
        id: `r-${r.id}`,
        ts: r.reviewed_at,
        type: r.status === "approved" ? "approved" : "rejected",
        clientName: nameMap.get(r.client_id) ?? "Client",
        amount: Number(r.total_amount),
        currency: r.currency,
        reason: r.rejection_reason,
        note: r.rejection_note,
      });
    }
    for (const p of paymentRows) {
      const cid = paymentReportMap.get(p.submitted_report_id)?.client_id;
      evts.push({
        id: `p-${p.id}`,
        ts: p.created_at,
        type: "payment",
        clientName: (cid && nameMap.get(cid)) || "Client",
        amount: Number(p.amount),
        currency: p.currency,
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
    () => events.filter((e) => new Date(e.ts).getTime() > seenAt).slice(0, 5),
    [events, seenAt],
  );

  if (!user || unread.length === 0) return null;

  const dismissAll = () => {
    const latest = new Date(unread[0].ts).getTime();
    localStorage.setItem(seenKey(user.id), String(latest));
    setSeenAt(latest);
  };

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
        } else {
          Icon = Wallet;
          title = `Payment received from ${e.clientName}`;
          body = `${sym}${(e.amount ?? 0).toFixed(2)}`;
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
                onClick={() => {
                  const t = new Date(e.ts).getTime();
                  if (t > seenAt) {
                    localStorage.setItem(seenKey(user.id), String(t));
                    setSeenAt(t);
                  }
                }}
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
