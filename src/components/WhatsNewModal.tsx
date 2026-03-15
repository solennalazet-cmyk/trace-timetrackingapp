import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WhatsNewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WhatsNewModal = ({ open, onOpenChange }: WhatsNewModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>What's New</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-3">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">v1.0.0</p>
            <p>Initial release of Trace — timer-first time tracking for freelancers.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsNewModal;
