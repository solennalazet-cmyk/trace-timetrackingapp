import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Timer, FolderOpen, BarChart3 } from "lucide-react";

interface HowTraceWorksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const steps = [
  {
    icon: Timer,
    title: "Start instantly",
    description: "Tap Start to begin. No setup needed.",
  },
  {
    icon: FolderOpen,
    title: "Assign later",
    description: "Add client, project, notes after the session.",
  },
  {
    icon: BarChart3,
    title: "Track and bill",
    description: "See your time in Reports. Invoice when ready.",
  },
];

const HowTraceWorksModal = ({ open, onOpenChange }: HowTraceWorksModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] rounded-2xl p-0">
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
