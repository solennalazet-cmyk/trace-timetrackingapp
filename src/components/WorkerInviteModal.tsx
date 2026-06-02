import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";

interface WorkerInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (data: { email: string; name?: string }) => Promise<void>;
}

const WorkerInviteModal = ({ open, onOpenChange, onInvite }: WorkerInviteModalProps) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setSending(false);
    }
  }, [open]);

  const handleSend = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    try {
      await onInvite({ email: email.trim(), name: name.trim() || undefined });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>Invite a worker</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            They'll be connected automatically once they sign up with this email. If they're already on Trace, they'll see the invite next time they sign in.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="worker-email">Worker email</Label>
            <Input
              id="worker-email"
              type="email"
              placeholder="worker@example.com"
              className="h-10 rounded-xl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="worker-name">Name (optional)</Label>
            <Input
              id="worker-name"
              type="text"
              placeholder="e.g. Jacqueline"
              className="h-10 rounded-xl"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl h-10" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1 rounded-xl h-10 gap-2" onClick={handleSend} disabled={!email.trim() || sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send invite
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerInviteModal;
