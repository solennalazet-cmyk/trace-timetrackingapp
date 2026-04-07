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
      <DialogContent className="max-w-[380px] rounded-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-mono text-timer-display text-2xl text-center">Trace</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 pt-4 space-y-2 text-center">
          <p className="text-sm text-muted-foreground">Version 1.0.0</p>
          <p className="text-sm text-foreground">Timer-first time tracking for freelancers.</p>
          <p className="text-xs text-muted-foreground mt-4">Made with care for independent professionals.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AboutModal;
