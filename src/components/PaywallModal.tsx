import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { redirectToCheckout } from "@/lib/stripe";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headline?: string;
  body?: string;
}

const PaywallModal = ({
  open,
  onOpenChange,
  headline = "This is a Pro feature",
  body = "Upgrade to Trace Pro to unlock unlimited clients, projects, reports, invoicing, and more.",
}: PaywallModalProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!user) {
      toast.error("Please sign in first.");
      return;
    }
    setLoading(true);
    try {
      await redirectToCheckout();
    } catch (err: any) {
      toast.error(err.message || "Failed to start checkout.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] rounded-2xl text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <Crown className="w-6 h-6 text-primary" />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-foreground">{headline}</h2>
        <p className="text-sm text-muted-foreground mt-2">{body}</p>
        <Button
          className="w-full mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleUpgrade}
          disabled={loading}
        >
          {loading ? "Redirecting…" : "Upgrade to Pro — €10/month"}
        </Button>
        <button
          className="text-sm text-muted-foreground underline mt-2"
          onClick={() => onOpenChange(false)}
        >
          Maybe later
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          Cancel anytime. No hidden fees.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default PaywallModal;
