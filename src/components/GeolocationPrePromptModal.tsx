import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GeolocationPrePromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnable: () => void;
  onDecline: () => void;
}

/**
 * Shown once before the OS-level location prompt fires. Sets expectations
 * so the browser permission dialog feels invited, not surprising.
 */
const GeolocationPrePromptModal = ({
  open,
  onOpenChange,
  onEnable,
  onDecline,
}: GeolocationPrePromptModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        position="centered"
        className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-3">
            <MapPin className="w-6 h-6 text-foreground" />
          </div>
          <DialogTitle>Add location to your sessions?</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Trace can attach your location to clock in/out times as proof you were on
            site. Coordinates stay private on your account — they only appear on
            exports <strong className="text-foreground">if you choose to include
            them</strong> in Export Settings. You're in control.
          </p>
        </div>
        <div className="px-6 pb-6 pt-2 space-y-2">
          <Button
            onClick={onEnable}
            className="w-full rounded-[28px] h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Enable location
          </Button>
          <Button
            variant="ghost"
            onClick={onDecline}
            className="w-full rounded-[28px] h-12 font-medium text-muted-foreground"
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GeolocationPrePromptModal;
