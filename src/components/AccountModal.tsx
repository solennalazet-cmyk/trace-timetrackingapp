import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crown, AlertTriangle, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { redirectToCheckout, redirectToPortal } from "@/lib/stripe";

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AccountModal = ({ open, onOpenChange }: AccountModalProps) => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeInterval, setUpgradeInterval] = useState<"monthly" | "yearly">("monthly");

  // Obfuscated support email — assembled at runtime to prevent scraping
  const supportEmail = useMemo(() => "connect" + "@" + "lla-studio" + ".com", []);

  // Check if yearly subscriber is within 30-day refund window
  const isInRefundWindow = useMemo(() => {
    if (!profile || (profile as any).billing_interval !== "year" || profile.plan !== "pro") return false;
    if (!profile.current_period_end) return false;
    // current_period_end is end of yearly period; subscription started ~1 year before
    const periodEnd = new Date(profile.current_period_end);
    const subscriptionStart = new Date(periodEnd);
    subscriptionStart.setFullYear(subscriptionStart.getFullYear() - 1);
    const daysSinceStart = (Date.now() - subscriptionStart.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceStart <= 30;
  }, [profile]);

  if (!user || !profile) return null;

  const memberSince = new Date(profile.created_at ?? user.created_at ?? "").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const handleNameSave = async () => {
    if (!nameValue.trim()) { setEditingName(false); return; }
    await supabase.from("profiles").update({ full_name: nameValue.trim() }).eq("id", user.id);
    toast.success("Name updated.");
    setEditingName(false);
    refreshProfile();
  };

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    try {
      await redirectToCheckout(upgradeInterval);
    } catch (err: any) {
      toast.error(err.message || "Failed to start checkout.");
      setUpgradeLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      await redirectToPortal();
    } catch (err: any) {
      toast.error(err.message || "Failed to open subscription portal.");
      setPortalLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    try {
      await supabase.from("time_entries").delete().eq("user_id", user.id);
      await supabase.from("projects").delete().eq("user_id", user.id);
      await supabase.from("clients").delete().eq("user_id", user.id);
      await supabase.from("tasks").delete().eq("user_id", user.id);
      await supabase.from("user_settings").delete().eq("user_id", user.id);
      await supabase.from("user_feedback").delete().eq("user_id", user.id);
      await supabase.from("invoices").delete().eq("user_id", user.id);
      await supabase.from("profiles").delete().eq("id", user.id);
      await signOut();
      localStorage.clear();
      toast.success("Account deleted.");
      navigate("/");
    } catch {
      toast.error("Failed to delete account.");
    }
    setDeleting(false);
    setDeleteOpen(false);
  };
    const periodEnd = new Date(profile.current_period_end);
    const subscriptionStart = new Date(periodEnd);
    subscriptionStart.setFullYear(subscriptionStart.getFullYear() - 1);
    const daysSinceStart = (Date.now() - subscriptionStart.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceStart <= 30;
  }, [profile]);

  const renderPlanToggle = () => (
    <div className="flex items-center justify-center gap-1 p-1 bg-muted rounded-full mb-3">
      <button
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
          upgradeInterval === "monthly"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground"
        }`}
        onClick={() => setUpgradeInterval("monthly")}
      >
        Monthly
      </button>
      <button
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
          upgradeInterval === "yearly"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground"
        }`}
        onClick={() => setUpgradeInterval("yearly")}
      >
        Yearly
      </button>
    </div>
  );

  const upgradeButtonText = upgradeLoading
    ? "Redirecting…"
    : upgradeInterval === "monthly"
      ? "Upgrade to Pro — €3.99/month"
      : "Upgrade to Pro — €39/year";

  const renderSubscription = () => {
    const plan = profile.plan;
    const status = profile.subscription_status;
    const billingInterval = (profile as any).billing_interval;

    if (plan === "trial" || plan === "free") {
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium">Plan: Free</p>
          <p className="text-xs text-muted-foreground">You're on the free plan.</p>
          {renderPlanToggle()}
          <Button
            className="w-full bg-primary text-primary-foreground rounded-[28px] h-12 font-bold"
            onClick={handleUpgrade}
            disabled={upgradeLoading}
          >
            {upgradeButtonText}
          </Button>
          {upgradeInterval === "monthly" && (
            <p className="text-xs text-muted-foreground mt-1">
              Or €39/year <span className="font-medium text-foreground">(save 20%)</span> · Prices include VAT
            </p>
          )}
          {upgradeInterval === "yearly" && (
            <p className="text-xs text-muted-foreground mt-1">
              That's €3.25/month · <span className="font-medium text-foreground">Save 20%</span> · Prices include VAT
            </p>
          )}
        </div>
      );
    }

    if (plan === "pro") {
      if (status === "past_due") {
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <p className="text-sm font-medium">Payment failed</p>
            </div>
            <p className="text-xs text-muted-foreground">Your last payment could not be processed.</p>
            <Button
              variant="outline"
              className="w-full rounded-[28px] h-10 gap-1"
              onClick={handleManageSubscription}
              disabled={portalLoading}
            >
              <ExternalLink className="w-3 h-3" /> {portalLoading ? "Opening…" : "Update payment method"}
            </Button>
          </div>
        );
      }

      if (status === "canceled") {
        const periodEnd = profile.current_period_end
          ? new Date(profile.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
          : "end of period";
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Plan: Trace Pro (Cancelling)</p>
              <Crown className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Access continues until {periodEnd}.</p>
            {renderPlanToggle()}
            <Button
              className="w-full bg-primary text-primary-foreground rounded-[28px] h-12 font-bold"
              onClick={handleUpgrade}
              disabled={upgradeLoading}
            >
              {upgradeLoading ? "Redirecting…" : "Resubscribe"}
            </Button>
          </div>
        );
      }

      // Active
      const nextBilling = profile.current_period_end
        ? new Date(profile.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : "—";
      const priceLabel = billingInterval === "year" ? "€39/year" : "€3.99/month";
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Plan: Trace Pro</p>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: "linear-gradient(135deg, hsl(43, 96%, 56%), hsl(53, 98%, 77%))",
                color: "hsl(217, 33%, 17%)",
              }}
            >
              PRO ✦
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Status: Active · {priceLabel}</p>
          <p className="text-xs text-muted-foreground">Next billing: {nextBilling}</p>
          {isInRefundWindow && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              You're within your 30-day refund window.{" "}
              <a href={`mailto:${supportEmail}`} className="text-primary underline">
                Contact us
              </a>{" "}
              to request a refund.
            </div>
          )}
          <Button
            variant="outline"
            className="w-full rounded-[28px] h-10 gap-1"
            onClick={handleManageSubscription}
            disabled={portalLoading}
          >
            <ExternalLink className="w-3 h-3" /> {portalLoading ? "Opening…" : "Manage Subscription"}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">Cancel anytime. Access continues to {nextBilling}.</p>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[420px] rounded-2xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Account & Subscription</DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-6 space-y-6">
            {/* Profile */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Profile</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Name</span>
                  {editingName ? (
                    <div className="flex items-center gap-1">
                    <Input
                        className="w-40 h-7 text-sm rounded-xl"
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleNameSave}>Save</Button>
                    </div>
                  ) : (
                    <button
                      className="text-sm font-medium hover:underline"
                      onClick={() => { setNameValue(profile.full_name ?? ""); setEditingName(true); }}
                    >
                      {profile.full_name || "Set name"}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Email</span>
                  <span className="text-sm text-foreground">{user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Member since</span>
                  <span className="text-sm text-foreground">{memberSince}</span>
                </div>
              </div>
            </div>

            {/* Subscription */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Subscription</h3>
              {renderSubscription()}
            </div>

            {/* Danger Zone */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-destructive mb-1">Delete Account</h3>
              <p className="text-xs text-muted-foreground mb-3">Permanently delete your account and all data. This cannot be undone.</p>
              <button
                className="text-sm text-destructive/70 hover:text-destructive underline"
                onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}
              >
                Delete my account
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[380px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all data. Type <strong>DELETE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Type DELETE"
            className="font-mono"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirm !== "DELETE" || deleting}
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground"
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AccountModal;
