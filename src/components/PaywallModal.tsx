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
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");

  const handleUpgrade = async () => {
    if (!user) {
      toast.error("Please sign in first.");
      return;
    }
    setLoading(true);
    try {
      await redirectToCheckout(interval);
    } catch (err: any) {
      toast.error(err.message || "Failed to start checkout.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] rounded-2xl p-0">
        <div className="px-6 pt-6 pb-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Crown className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-foreground">{headline}</h2>
          <p className="text-sm text-muted-foreground mt-2">{body}</p>

          {/* Plan toggle */}
          <div className="flex items-center justify-center gap-1 mt-4 p-1 bg-muted rounded-full">
            <button
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                interval === "monthly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
              onClick={() => setInterval("monthly")}
            >
              Monthly
            </button>
            <button
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                interval === "yearly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
              onClick={() => setInterval("yearly")}
            >
              Yearly
            </button>
          </div>

          <Button
            className="w-full mt-4 rounded-[28px] h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleUpgrade}
            disabled={loading}
          >
            {loading
              ? "Redirecting…"
              : interval === "monthly"
                ? "Upgrade to Pro — €3.99/month"
                : "Upgrade to Pro — €39/year"}
          </Button>
          {interval === "monthly" && (
            <p className="text-xs text-muted-foreground mt-2">
              Or €39/year <span className="font-medium text-foreground">(save 20%)</span>
            </p>
          )}
          {interval === "yearly" && (
            <p className="text-xs text-muted-foreground mt-2">
              That's €3.25/month · <span className="font-medium text-foreground">Save 20%</span>
            </p>
          )}
          <button
            className="text-sm text-muted-foreground underline mt-3 block mx-auto"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Prices include VAT. Cancel anytime.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaywallModal;
