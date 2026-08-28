import { useEffect, useState } from "react";
import { Bug, ChevronDown, Copy, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { clearErrorLog, formatErrorLogForCopy, getErrorLog, type TraceErrorEntry } from "@/lib/error-log";

/**
 * Local-only diagnostics: shows runtime errors captured on this device so a
 * user can copy them into a bug report. Nothing is uploaded from here.
 */
const DiagnosticsCard = () => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TraceErrorEntry[]>(() => getErrorLog());
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setEntries(getErrorLog());
    window.addEventListener("trace-error-logged", refresh);
    return () => window.removeEventListener("trace-error-logged", refresh);
  }, []);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorLogForCopy());
      toast.success("Diagnostics copied");
    } catch {
      toast.error("Could not copy — long-press to select instead");
    }
  };

  return (
    <Card className="p-0 overflow-hidden rounded-2xl">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Bug className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Diagnostics</p>
          <p className="text-[11px] text-muted-foreground">
            {entries.length === 0
              ? "No errors recorded on this device"
              : `${entries.length} recent error${entries.length === 1 ? "" : "s"} on this device`}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing to report. If something breaks, come back here and copy the details into Send Feedback.
            </p>
          ) : (
            <>
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {entries.map((entry, i) => (
                  <div key={`${entry.at}-${i}`} className="rounded-xl border p-2.5">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpanded(expanded === i ? null : i)}
                    >
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(entry.at).toLocaleString()} · {entry.source}
                        {entry.route ? ` · ${entry.route}` : ""}
                      </p>
                      <p className="text-xs font-medium break-words">{entry.message}</p>
                    </button>
                    {expanded === i && entry.stack && (
                      <pre className="mt-2 text-[10px] leading-4 whitespace-pre-wrap break-words text-muted-foreground">
                        {entry.stack}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-xl gap-1.5" onClick={copyAll}>
                  <Copy className="w-3.5 h-3.5" /> Copy all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 rounded-xl gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => {
                    clearErrorLog();
                    setEntries([]);
                    setExpanded(null);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
};

export default DiagnosticsCard;
