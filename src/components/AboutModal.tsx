import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AboutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AboutModal = ({ open, onOpenChange }: AboutModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-2xl text-center">
        <DialogHeader>
          <DialogTitle className="font-mono text-timer-display text-2xl">Trace</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <p className="text-sm text-muted-foreground">Version 1.0.0</p>
          <p className="text-sm text-foreground">Timer-first time tracking for freelancers.</p>
          <p className="text-xs text-muted-foreground mt-4">Made with care for independent professionals.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AboutModal;
