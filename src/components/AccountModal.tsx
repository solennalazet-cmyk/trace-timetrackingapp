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
import { Switch } from "@/components/ui/switch";
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

  // Billing fields
  const [editingBilling, setEditingBilling] = useState(false);
  const [bizName, setBizName] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [bizTaxId, setBizTaxId] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizPaymentLink, setBizPaymentLink] = useState("");
  const [bizShowOnExport, setBizShowOnExport] = useState(true);

  const supportEmail = useMemo(() => "connect" + "@" + "lla-studio" + ".com", []);

  const isInRefundWindow = useMemo(() => {
    if (!profile || (profile as any).billing_interval !== "year" || profile.plan !== "pro") return false;
    if (!profile.current_period_end) return false;
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

  const handleBillingSave = async () => {
    await supabase.from("profiles").update({
      business_name: bizName.trim() || null,
      business_address: bizAddress.trim() || null,
      tax_id: bizTaxId.trim() || null,
      phone: bizPhone.trim() || null,
      payment_link: bizPaymentLink.trim() || null,
      show_business_on_export: bizShowOnExport,
    }).eq("id", user.id);
    toast.success("Billing details saved.");
    setEditingBilling(false);
    refreshProfile();
  };

  const openBillingEdit = () => {
    setBizName(profile.business_name ?? "");
    setBizAddress(profile.business_address ?? "");
    setBizTaxId(profile.tax_id ?? "");
    setBizPhone(profile.phone ?? "");
    setBizPaymentLink(profile.payment_link ?? "");
    setBizShowOnExport(profile.show_business_on_export !== false);
    setEditingBilling(true);
  };

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    try { await redirectToCheckout(upgradeInterval); }
    catch (err: any) { toast.error(err.message || "Failed to start checkout."); setUpgradeLoading(false); }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try { await redirectToPortal(); }
    catch (err: any) { toast.error(err.message || "Failed to open portal."); setPortalLoading(false); }
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
    } catch { toast.error("Failed to delete account."); }
    setDeleting(false);
    setDeleteOpen(false);
  };

  const renderPlanToggle = () => (
    <div className="flex items-center justify-center gap-1 p-1 bg-muted rounded-full mb-3">
      <button
        className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
          upgradeInterval === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
        }`}
        onClick={() => setUpgradeInterval("monthly")}
      >Monthly</button>
      <button
        className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
          upgradeInterval === "yearly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
        }`}
        onClick={() => setUpgradeInterval("yearly")}
      >Yearly</button>
    </div>
  );

  const upgradeButtonText = upgradeLoading
    ? "Redirecting…"
    : upgradeInterval === "monthly" ? "Upgrade to Pro — €3.99/month" : "Upgrade to Pro — €39/year";

  const renderSubscription = () => {
    const plan = profile.plan;
    const status = profile.subscription_status;
    const billingInterval = (profile as any).billing_interval;

    if (plan === "trial" || plan === "free") {
      return (
        <div className="space-y-3">
          <p className="text-xs font-medium">Plan: Free</p>
          <p className="text-[11px] text-muted-foreground">You're on the free plan.</p>
          {renderPlanToggle()}
          <Button className="w-full bg-primary text-primary-foreground rounded-[28px] h-11 font-bold text-sm" onClick={handleUpgrade} disabled={upgradeLoading}>
            {upgradeButtonText}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            {upgradeInterval === "monthly"
              ? <>Or €39/year <span className="font-medium text-foreground">(save 20%)</span> · VAT included</>
              : <>That's €3.25/month · <span className="font-medium text-foreground">Save 20%</span> · VAT included</>
            }
          </p>
        </div>
      );
    }

    if (plan === "pro") {
      if (status === "past_due") {
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <p className="text-xs font-medium">Payment failed</p>
            </div>
            <p className="text-[11px] text-muted-foreground">Your last payment could not be processed.</p>
            <Button variant="outline" className="w-full rounded-[28px] h-10 gap-1 text-xs" onClick={handleManageSubscription} disabled={portalLoading}>
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
              <p className="text-xs font-medium">Plan: Trace Pro (Cancelling)</p>
              <Crown className="w-4 h-4 text-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">Access continues until {periodEnd}.</p>
            {renderPlanToggle()}
            <Button className="w-full bg-primary text-primary-foreground rounded-[28px] h-11 font-bold text-sm" onClick={handleUpgrade} disabled={upgradeLoading}>
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
            <p className="text-xs font-medium">Plan: Trace Pro</p>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: "linear-gradient(135deg, hsl(43, 96%, 56%), hsl(53, 98%, 77%))", color: "hsl(217, 33%, 17%)" }}
            >PRO ✦</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Status: Active · {priceLabel}</p>
          <p className="text-[11px] text-muted-foreground">Next billing: {nextBilling}</p>
          {isInRefundWindow && (
            <div className="bg-muted/50 rounded-lg p-3 text-[11px] text-muted-foreground">
              You're within your 30-day refund window.{" "}
              <a href={`mailto:${supportEmail}`} className="text-foreground font-medium underline">Contact us</a> to request a refund.
            </div>
          )}
          <Button variant="outline" className="w-full rounded-[28px] h-10 gap-1 text-xs" onClick={handleManageSubscription} disabled={portalLoading}>
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
        <DialogContent className="max-w-[420px] w-[calc(100vw-2rem)] rounded-2xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-5 pt-6 pb-2">
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>

          <div className="px-5 pb-6 space-y-4">

            {/* ── Card 1: Profile ── */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Profile</p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Name</span>
                  {editingName ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="w-36 h-7 text-xs rounded-lg"
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleNameSave()}
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={handleNameSave}>Save</Button>
                    </div>
                  ) : (
                    <button
                      className="text-xs font-medium hover:underline"
                      onClick={() => { setNameValue(profile.full_name ?? ""); setEditingName(true); }}
                    >
                      {profile.full_name || "Set name"}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Email</span>
                  <span className="text-xs text-foreground">{user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Member since</span>
                  <span className="text-xs text-foreground">{memberSince}</span>
                </div>
              </div>
            </div>

            {/* ── Card 2: Billing & Invoice Details ── */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Billing & Invoice Details</p>
              <p className="text-[11px] text-muted-foreground">These details will appear on exported PDFs and shared invoices.</p>
              {editingBilling ? (
                <div className="space-y-2.5">
                  <Input className="h-8 text-xs rounded-lg" placeholder="Name / Business name" value={bizName} onChange={(e) => setBizName(e.target.value)} />
                  <Input className="h-8 text-xs rounded-lg" placeholder={`Email (default: ${user.email})`} value="" disabled />
                  <Input className="h-8 text-xs rounded-lg" placeholder="Phone number (optional)" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} />
                  <textarea
                    className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 min-h-[48px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Address (optional)"
                    value={bizAddress}
                    onChange={(e) => setBizAddress(e.target.value)}
                  />
                  <Input className="h-8 text-xs rounded-lg" placeholder="Tax / Company number (optional)" value={bizTaxId} onChange={(e) => setBizTaxId(e.target.value)} />
                  <Input className="h-8 text-xs rounded-lg" placeholder="Payment link (optional)" value={bizPaymentLink} onChange={(e) => setBizPaymentLink(e.target.value)} />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">Show on exports</span>
                    <Switch checked={bizShowOnExport} onCheckedChange={setBizShowOnExport} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] flex-1" onClick={() => setEditingBilling(false)}>Cancel</Button>
                    <Button size="sm" className="h-7 text-[11px] flex-1" onClick={handleBillingSave}>Save</Button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                  onClick={openBillingEdit}
                >
                  {profile.business_name ? `${profile.business_name} · Edit` : "Add billing details"}
                </button>
              )}
            </div>

            {/* ── Card 3: Subscription ── */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Subscription</p>
              {renderSubscription()}
            </div>

            {/* ── Card 4: Danger Zone ── */}
            <div className="rounded-2xl border border-border/50 bg-card p-4 opacity-70">
              <button
                className="text-[11px] text-destructive/60 hover:text-destructive transition-colors underline"
                onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}
              >
                Delete my account
              </button>
              <p className="text-[10px] text-muted-foreground mt-1">Permanently delete your account and all data.</p>
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
