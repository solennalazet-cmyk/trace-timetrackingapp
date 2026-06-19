import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Timer, FolderOpen, BarChart3, Smartphone, ChevronDown, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface HowTraceWorksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const steps = [
  {
    icon: Timer,
    title: "Just hit Start — you've got this",
    description: "No setup, no friction. Capture the work as it happens.",
  },
  {
    icon: FolderOpen,
    title: "Tidy up whenever",
    description: "Assign client, project and notes after the session. Your flow comes first.",
  },
  {
    icon: BarChart3,
    title: "Turn time into income",
    description: "Watch your hours add up in Reports and bill with confidence.",
  },
  {
    icon: ShieldCheck,
    title: "Sign up to keep it safe",
    description: "Create a free account to secure your tracked reports, sync across devices and never lose a minute of work.",
  },
];

const HowTraceWorksModal = ({ open, onOpenChange }: HowTraceWorksModalProps) => {
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl p-0 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-mono text-timer-display text-xl">How Trace Works</DialogTitle>
        </DialogHeader>
        <div className="px-6 space-y-6 pt-4">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <step.icon className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}

          {/* Install on phone — expandable */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">Install on your phone</p>
              <p className="text-sm text-muted-foreground">
                Open Trace in your browser → add it to your home screen so it runs like a real app.
              </p>
              <button
                type="button"
                onClick={() => setInstallOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-foreground underline-offset-2 hover:underline"
                aria-expanded={installOpen}
              >
                Show me how
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", installOpen && "rotate-180")} />
              </button>
              {installOpen && (
                <div className="mt-3 rounded-lg bg-muted/50 px-3 py-3 space-y-2.5 text-xs text-foreground">
                  <div>
                    <p className="font-semibold">iPhone (Safari)</p>
                    <p className="text-muted-foreground">
                      Tap the <span className="text-foreground font-medium">Share</span> button →
                      <span className="text-foreground font-medium"> Add to Home Screen</span> →
                      <span className="text-foreground font-medium"> Add</span>.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">Android (Chrome)</p>
                    <p className="text-muted-foreground">
                      Tap the <span className="text-foreground font-medium">⋮ menu</span> →
                      <span className="text-foreground font-medium"> Install app</span> (or
                      <span className="text-foreground font-medium"> Add to Home screen</span>).
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                    Once installed, Trace opens fullscreen — no browser bar — and notifications work reliably.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 pt-2">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full rounded-[28px] h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HowTraceWorksModal;
