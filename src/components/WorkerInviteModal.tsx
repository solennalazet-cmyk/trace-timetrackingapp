import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, MessageCircle, Copy, ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface WorkerInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persists the invite row. Returns the new invite_token (uuid) on success. */
  onInvite: (data: { email: string; name?: string }) => Promise<string | null>;
}

const APP_URL = "https://trace.lla-studio.com";

const WorkerInviteModal = ({ open, onOpenChange, onInvite }: WorkerInviteModalProps) => {
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setSending(false);
      setToken(null);
      setCopied(false);
    }
  }, [open]);

  const fromName = profile?.full_name?.trim() || "Your employer";
  const targetName = (name.trim() || "there").split(" ")[0];

  const message = useMemo(() => {
    return `Hi ${targetName}, ${fromName} invited you to track your hours on Trace. Sign up with this email (${email}) and you'll connect automatically: ${APP_URL}`;
  }, [targetName, fromName, email]);

  const handleSend = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    try {
      const t = await onInvite({ email: email.trim(), name: name.trim() || undefined });
      if (t) setToken(t);
    } finally {
      setSending(false);
    }
  };

  const mailtoHref = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    `${fromName} invited you to Trace`
  )}&body=${encodeURIComponent(message)}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Message copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Long-press to select instead.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-3rem)] max-w-[400px] rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle>
            {token ? "Share the invite" : "Invite a freelancer"}
          </DialogTitle>
        </DialogHeader>

        {!token ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              We'll save the invite. They'll be connected automatically once they sign up with this email.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="freelancer-email">Freelancer email</Label>
              <Input
                id="freelancer-email"
                type="email"
                placeholder="name@example.com"
                className="h-11 rounded-xl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="freelancer-name">Name (optional)</Label>
              <Input
                id="freelancer-name"
                type="text"
                placeholder="e.g. Jacqueline"
                className="h-11 rounded-xl"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="flex-1 rounded-xl h-11" onClick={handleSend} disabled={!email.trim() || sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Next"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Send {targetName} the invite using your own email or WhatsApp — it'll come from you, so they're more likely to reply.
            </p>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
              {message}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="outline" className="h-14 rounded-xl flex-col gap-1">
                <a href={mailtoHref}>
                  <Mail className="h-4 w-4" />
                  <span className="text-[11px] font-medium">Email</span>
                </a>
              </Button>
              <Button asChild variant="outline" className="h-14 rounded-xl flex-col gap-1">
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-[11px] font-medium">WhatsApp</span>
                </a>
              </Button>
              <Button variant="outline" className="h-14 rounded-xl flex-col gap-1" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="text-[11px] font-medium">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                className="flex-1 rounded-xl h-11 gap-2"
                onClick={() => { setToken(null); setEmail(""); setName(""); }}
              >
                <ArrowLeft className="h-4 w-4" /> New invite
              </Button>
              <Button className="flex-1 rounded-xl h-11" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WorkerInviteModal;
