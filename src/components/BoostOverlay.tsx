import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Play, X } from "lucide-react";
import { getBoostChallenge, type BoostChallenge } from "@/lib/boost-challenges";

interface BoostOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hourProgress: number;
  revenueProgress: number;
  onStartSession: () => void;
}

const BoostOverlay = ({ open, onOpenChange, hourProgress, revenueProgress, onStartSession }: BoostOverlayProps) => {
  // Generate a new challenge each time the dialog opens
  const challenge = useMemo<BoostChallenge>(() => {
    if (!open) return { type: "time", message: "" };
    return getBoostChallenge(hourProgress, revenueProgress);
  }, [open, hourProgress, revenueProgress]);

  const avgProgress = Math.round(
    ((hourProgress || 0) + (revenueProgress || 0)) /
    ((hourProgress > 0 ? 1 : 0) + (revenueProgress > 0 ? 1 : 0) || 1)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent position="centered" className="p-0 w-[calc(100vw-2rem)] max-w-sm">
        <div className="p-6 pb-4">
          {/* Beta badge */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  You're {avgProgress}% there
                </DialogTitle>
              </DialogHeader>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
              Beta
            </span>
          </div>

          {/* Challenge type indicator */}
          <div className="mb-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {challenge.type === "revenue" ? "💰 Revenue boost" : "⏱️ Productivity boost"}
            </span>
          </div>

          {/* Challenge message */}
          <p className="text-sm text-foreground leading-relaxed mb-6">
            {challenge.message}
          </p>

          {/* CTAs */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                onOpenChange(false);
                onStartSession();
              }}
              className="w-full gap-2 rounded-xl h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Play className="w-4 h-4" />
              Start 15 min session
            </Button>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full text-muted-foreground text-sm"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BoostOverlay;
