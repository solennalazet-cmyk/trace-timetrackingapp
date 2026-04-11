import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConflictAction = "clock-out" | "discard" | "cancel";

interface SessionConflictDialogProps {
  open: boolean;
  activeMode: string;
  targetMode: string;
  onAction: (action: ConflictAction) => void;
}

const MODE_LABELS: Record<string, string> = {
  stopwatch: "Stopwatch",
  focus: "Focus",
  shift: "Shift",
};

const SessionConflictDialog = ({
  open,
  activeMode,
  targetMode,
  onAction,
}: SessionConflictDialogProps) => {
  const activeLabel = MODE_LABELS[activeMode] ?? activeMode;
  const targetLabel = MODE_LABELS[targetMode] ?? targetMode;
  const isShift = activeMode === "shift";

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Session in progress</AlertDialogTitle>
          <AlertDialogDescription>
            You have an active <span className="font-semibold text-foreground">{activeLabel}</span> session running.
            What would you like to do before switching to <span className="font-semibold text-foreground">{targetLabel}</span>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => onAction("clock-out")}
            className="w-full rounded-xl"
          >
            {isShift ? "Clock out & switch" : "Stop & save session"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onAction("discard")}
            className="w-full rounded-xl text-destructive hover:text-destructive"
          >
            Discard {activeLabel} session
          </Button>
          <Button
            variant="ghost"
            onClick={() => onAction("cancel")}
            className="w-full rounded-xl"
          >
            Stay on {activeLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SessionConflictDialog;
