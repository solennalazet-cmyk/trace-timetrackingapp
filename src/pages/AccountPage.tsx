import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, ReceiptText, Crown, ChevronRight, Trash2, AlertTriangle, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { redirectToCheckout, redirectToPortal } from "@/lib/stripe";
import Seo from "@/components/Seo";

type EditorKind = "profile" | "billing" | null;

const AccountPage = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [editor, setEditor] = useState<EditorKind>(null);
  const [saving, setSaving] = useState(false);

  // Profile fields
  const [name, setName] = useState("");
  // Billing fields
  const [bizName, setBizName] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [bizTaxId, setBizTaxId] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizPaymentLink, setBizPaymentLink] = useState("");
  const [bizShowOnExport, setBizShowOnExport] = useState(true);

  const [upgradeInterval, setUpgradeInterval] = useState<"monthly" | "yearly">("monthly");
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (editor === "profile") {
      setName(profile?.full_name ?? "");
    } else if (editor === "billing") {
      setBizName(profile?.business_name ?? "");
      setBizAddress(profile?.business_address ?? "");
      setBizTaxId(profile?.tax_id ?? "");
      setBizPhone(profile?.phone ?? "");
      setBizPaymentLink(profile?.payment_link ?? "");
      setBizShowOnExport(profile?.show_business_on_export !== false);
    }
  }, [editor, profile]);

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

  if (!user || !profile) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground">Loading…</div>;
  }

  const memberSince = new Date(profile.created_at ?? user.created_at ?? "").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const saveProfile = async () => {
    if (!name.trim()) { setEditor(null); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated.");
    setEditor(null);
    refreshProfile();
  };

  const saveBilling = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      business_name: bizName.trim() || null,
      business_address: bizAddress.trim() || null,
      tax_id: bizTaxId.trim() || null,
      phone: bizPhone.trim() || null,
      payment_link: bizPaymentLink.trim() || null,
      show_business_on_export: bizShowOnExport,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Billing details saved.");
    setEditor(null);
    refreshProfile();
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

  const profileSummary = [profile.full_name || "Set your name", user.email].filter(Boolean).join(" · ");
  const billingSummary = profile.business_name
    ? `${profile.business_name}${profile.show_business_on_export === false ? " · Hidden on exports" : ""}`
    : "Add business name, address, tax ID for exports";

  const planLabel = profile.plan === "pro"
    ? `Trace Pro · ${(profile as any).billing_interval === "year" ? "€39/year" : "€3.99/month"}`
    : profile.plan === "trial"
      ? "Free trial"
      : "Free plan";

  return (
    <div className="pt-4 pb-24 space-y-5">
      <Seo title="Account — Trace" description="Manage your Trace profile, billing details, and subscription." path="/account" />

      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <header className="space-y-1 pt-1">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">Tap a card to edit. Changes save instantly.</p>
      </header>

      <div className="space-y-2.5">
        {/* Profile */}
        <button onClick={() => setEditor("profile")} className="w-full text-left">
          <Card className="p-4 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Profile</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{profileSummary}</p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">Member since {memberSince}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </Card>
        </button>

        {/* Billing details */}
        <button onClick={() => setEditor("billing")} className="w-full text-left">
          <Card className="p-4 hover:bg-muted/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                <ReceiptText className="w-4 h-4 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Billing & invoice details</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{billingSummary}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </Card>
        </button>

        {/* Subscription */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Subscription</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{planLabel}</p>
            </div>
          </div>

          {profile.plan === "pro" ? (
            <div className="space-y-2">
              {profile.subscription_status === "past_due" && (
                <div className="flex items-center gap-2 text-destructive text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" /> Payment failed
                </div>
              )}
              {profile.current_period_end && (
                <p className="text-[11px] text-muted-foreground">
                  Next billing: {new Date(profile.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
              {isInRefundWindow && (
                <p className="text-[11px] text-muted-foreground">
                  Within 30-day refund window. <a href={`mailto:${supportEmail}`} className="underline text-foreground">Contact us</a>.
                </p>
              )}
              <Button variant="outline" className="w-full h-10 rounded-xl gap-1.5 text-xs mt-1" onClick={handleManageSubscription} disabled={portalLoading}>
                <ExternalLink className="w-3.5 h-3.5" /> {portalLoading ? "Opening…" : "Manage subscription"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-1 p-1 bg-muted rounded-full">
                <button
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${upgradeInterval === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setUpgradeInterval("monthly")}
                >Monthly</button>
                <button
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${upgradeInterval === "yearly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setUpgradeInterval("yearly")}
                >Yearly</button>
              </div>
              <Button className="w-full h-11 rounded-xl font-bold text-sm" onClick={handleUpgrade} disabled={upgradeLoading}>
                {upgradeLoading ? "Redirecting…" : upgradeInterval === "monthly" ? "Upgrade — €3.99/month" : "Upgrade — €39/year"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                {upgradeInterval === "monthly"
                  ? <>Or €39/year <span className="font-medium text-foreground">(save 20%)</span> · VAT included</>
                  : <>That's €3.25/month · <span className="font-medium text-foreground">Save 20%</span> · VAT included</>
                }
              </p>
            </div>
          )}
        </Card>

        <DiagnosticsCard />

        {/* Danger zone */}

        <div className="pt-4">
          <Button
            variant="ghost"
            className="w-full h-11 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}
          >
            <Trash2 className="w-4 h-4" /> Delete my account
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1">Permanently removes your account and all data.</p>
        </div>
      </div>

      {/* Profile focus editor */}
      <Sheet open={editor === "profile"} onOpenChange={(v) => !v && setEditor(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-4 pb-6 max-h-[92vh] overflow-y-auto">
          <SheetHeader className="text-left mb-4">
            <SheetTitle className="text-lg">Profile</SheetTitle>
            <p className="text-xs text-muted-foreground">Your name as it appears in the app.</p>
          </SheetHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-sm rounded-xl" placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</Label>
              <Input value={user.email ?? ""} disabled className="h-11 text-sm rounded-xl" />
            </div>
          </div>
          <div className="flex gap-2 pt-5">
            <Button variant="ghost" className="flex-1 h-11 rounded-xl" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button>
            <Button className="flex-1 h-11 rounded-xl" onClick={saveProfile} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Billing focus editor */}
      <Sheet open={editor === "billing"} onOpenChange={(v) => !v && setEditor(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-4 pb-6 max-h-[92vh] overflow-y-auto">
          <SheetHeader className="text-left mb-4">
            <SheetTitle className="text-lg">Billing & invoice details</SheetTitle>
            <p className="text-xs text-muted-foreground">Shown on exported PDFs and shared invoices.</p>
          </SheetHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Name / Business name</Label>
              <Input value={bizName} onChange={(e) => setBizName(e.target.value)} className="h-11 text-sm rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone (optional)</Label>
              <Input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} className="h-11 text-sm rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Address (optional)</Label>
              <textarea
                className="w-full text-sm rounded-xl border border-input bg-background px-3 py-2 min-h-[64px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={bizAddress}
                onChange={(e) => setBizAddress(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tax / Company number (optional)</Label>
              <Input value={bizTaxId} onChange={(e) => setBizTaxId(e.target.value)} className="h-11 text-sm rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment link (optional)</Label>
              <Input value={bizPaymentLink} onChange={(e) => setBizPaymentLink(e.target.value)} className="h-11 text-sm rounded-xl" placeholder="https://…" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-foreground">Show on exports</span>
              <Switch checked={bizShowOnExport} onCheckedChange={setBizShowOnExport} />
            </div>
          </div>
          <div className="flex gap-2 pt-5">
            <Button variant="ghost" className="flex-1 h-11 rounded-xl" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button>
            <Button className="flex-1 h-11 rounded-xl" onClick={saveBilling} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete account */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all data. Type <strong>DELETE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type DELETE" className="font-mono" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirm !== "DELETE" || deleting}
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountPage;
