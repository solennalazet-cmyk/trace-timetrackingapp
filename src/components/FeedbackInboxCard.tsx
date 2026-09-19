import { useEffect, useState } from "react";
import { ChevronDown, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface FeedbackRow {
  id: string;
  type: string | null;
  message: string;
  created_at: string | null;
  user_id: string | null;
  context: any;
}

/**
 * Admin-only inbox for user-submitted bug reports / feedback, including the
 * technical context captured at submit time. Visible only to accounts that
 * carry the "admin" role.
 */
const FeedbackInboxCard = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    setLoading(true);
    setLoadError(false);
    supabase
      .from("user_feedback")
      .select("id, type, message, created_at, user_id, context")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          setLoadError(true);
          return;
        }
        setRows((data ?? []) as FeedbackRow[]);
      });
  }, [open, isAdmin]);

  if (!isAdmin) return null;

  return (
    <Card className="p-0 overflow-hidden rounded-2xl">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Inbox className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Feedback inbox</p>
          <p className="text-[11px] text-muted-foreground">Bug reports sent from the app</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t pt-3 space-y-2 max-h-[360px] overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : loadError ? (
            <p className="text-xs text-destructive">Couldn't load feedback. Check your connection and try again.</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No feedback yet.</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-xl border p-2.5">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <p className="text-[11px] text-muted-foreground">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "—"} · {row.type ?? "other"}
                    {row.context?.userEmail ? ` · ${row.context.userEmail}` : ""}
                  </p>
                  <p className="text-xs break-words">{row.message}</p>
                </button>
                {expanded === row.id && row.context?.screenshotPath && (
                  <FeedbackScreenshot path={row.context.screenshotPath} />
                )}
                {expanded === row.id && row.context && (
                  <pre className="mt-2 text-[10px] leading-4 whitespace-pre-wrap break-words text-muted-foreground">
                    {JSON.stringify(row.context, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
};

export default FeedbackInboxCard;
