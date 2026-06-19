import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Handshake, Building2, ChevronRight, Trash2, UserPlus, Send, Loader2, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import AccountFocusEditor, { type AccountEditorKind } from "@/components/AccountFocusEditor";
import AccountContractCard from "@/components/AccountContractCard";
import SignInLink from "@/components/SignInLink";
import { getAnonymousClients, saveAnonymousClient, deleteAnonymousClient } from "@/lib/anonymous-store";

interface AccountRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  default_rate: number | null;
  currency: string | null;
  payment_terms_days: number | null;
  billing_notes: string | null;
  nif: string | null;
  business_address: string | null;
  contract_url: string | null;
  user_id: string;
  kind: string;
  invited_email?: string | null;
  connection_status?: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF",
};

const initials = (name: string) => (name?.trim()?.slice(0, 1) ?? "?").toUpperCase();

const FieldLine = ({ label, value }: { label: string; value: string | null }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-t border-border/60 first:border-t-0 first:pt-0 last:pb-0">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span className="text-xs font-medium text-foreground text-right leading-relaxed whitespace-pre-line break-words min-w-0">
      {value?.trim() || "—"}
    </span>
  </div>
);

const AccountProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [client, setAccount] = useState<AccountRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState<AccountEditorKind | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectEmail, setConnectEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const isAnonymous = !user;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    if (user) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, email, phone, default_rate, currency, payment_terms_days, billing_notes, nif, business_address, contract_url, user_id, kind, invited_email, connection_status")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      setAccount(data as AccountRow | null);
    } else {
      const c = getAnonymousClients().find((c: any) => c.id === id);
      setAccount(c ? {
        id: c.id,
        name: c.name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        default_rate: c.default_rate ?? null,
        currency: c.currency ?? "EUR",
        payment_terms_days: c.payment_terms_days ?? null,
        billing_notes: c.billing_notes ?? null,
        nif: c.nif ?? null,
        business_address: c.business_address ?? null,
        contract_url: null,
        user_id: "",
        kind: "account",
        invited_email: null,
        connection_status: null,
      } : null);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!client) return;
    setDeleting(true);
    if (user) {
      let error;
      if (client.kind === "both") {
        ({ error } = await supabase.from("clients").update({ kind: "contractor" }).eq("id", client.id));
      } else {
        ({ error } = await supabase.from("clients").delete().eq("id", client.id));
      }
      setDeleting(false);
      if (error) { toast.error(error.message); return; }
    } else {
      deleteAnonymousClient(client.id);
      setDeleting(false);
    }
    toast.success("Client deleted.");
    setDeleteOpen(false);
    navigate("/clients");
  };

  // Save handler for the focus editor when in anonymous mode
  const saveAnonymous = async (payload: Record<string, any>) => {
    if (!client) return;
    saveAnonymousClient({ ...client, ...payload, id: client.id });
  };

  const sendInvite = async () => {
    if (!client || !user) return;
    const email = connectEmail.trim().toLowerCase();
    if (!email) return;
    setSendingInvite(true);
    const { error } = await supabase.from("clients").update({
      invited_email: email,
      connection_status: "pending",
      connection_initiated_by: "worker",
      invited_at: new Date().toISOString(),
    } as any).eq("id", client.id);
    setSendingInvite(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Invite sent.");
    setConnectOpen(false);
    load();
  };

  const disconnect = async () => {
    if (!client || !user) return;
    setSendingInvite(true);
    const { error } = await supabase.from("clients").update({
      invited_email: null,
      connection_status: null,
      connection_initiated_by: null,
      connected_user_id: null,
      invited_at: null,
    } as any).eq("id", client.id);
    setSendingInvite(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Disconnected.");
    setConnectOpen(false);
    load();
  };

  if (loading) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground px-4">Loading…</div>;
  }
  if (!client) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground px-4">Client not found.</div>;
  }

  const sym = CURRENCY_SYMBOLS[client.currency ?? "EUR"] ?? "€";
  const connStatus = client.connection_status ?? "none";

  type CardDef = { kind: AccountEditorKind; Icon: typeof Mail; title: string; rows: { label: string; value: string | null }[] };
  const cards: CardDef[] = [
    {
      kind: "contact",
      Icon: Mail,
      title: "Contact",
      rows: [
        { label: "Name", value: client.name },
        { label: "Email", value: client.email },
        { label: "Phone", value: client.phone },
      ],
    },
    {
      kind: "commercial",
      Icon: Handshake,
      title: "Commercial agreement",
      rows: [
        { label: "Default rate", value: client.default_rate != null ? `${sym}${client.default_rate}/hour` : null },
        { label: "Currency", value: client.currency ?? "EUR" },
        { label: "Payment terms", value: client.payment_terms_days != null ? `${client.payment_terms_days} days` : null },
        { label: "Billing notes", value: client.billing_notes },
      ],
    },
    {
      kind: "business",
      Icon: Building2,
      title: "Business details",
      rows: [
        { label: "NIF / VAT", value: client.nif },
        { label: "Address", value: client.business_address },
      ],
    },
  ];

  return (
    <div className="pt-4 pb-24 px-4 space-y-5">
      <Seo title={`${client.name} — Client profile`} description={`Manage ${client.name}: contact, commercial agreement, business details and contract.`} path={`/clients/${client.id}`} />

      <button onClick={() => navigate("/clients")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Clients
      </button>

      <header className="flex items-center gap-4 pt-1">
        <div className="h-16 w-16 rounded-full bg-foreground/10 text-foreground flex items-center justify-center text-2xl font-semibold shrink-0">
          {initials(client.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight truncate">{client.name}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {client.default_rate != null ? `${sym}${client.default_rate}/hour` : "Rate not set"}
          </p>
          {/* Discrete Trace-connection CTA */}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] flex-wrap">
            {connStatus === "accepted" ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-nav-bg shrink-0" />
                <span className="text-muted-foreground">Connected on Trace</span>
                <span className="text-muted-foreground/50">·</span>
                <button
                  onClick={() => setConnectOpen(true)}
                  className="text-muted-foreground hover:text-destructive underline-offset-2 hover:underline"
                >
                  Disconnect
                </button>
              </>
            ) : connStatus === "pending" ? (
              <>
                <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Invite pending</span>
                <span className="text-muted-foreground/50">·</span>
                <button
                  onClick={() => { setConnectEmail(client.invited_email ?? ""); setConnectOpen(true); }}
                  className="text-foreground hover:underline underline-offset-2"
                >
                  Manage
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  if (isAnonymous) { toast.info("Sign in to connect with this client on Trace."); return; }
                  setConnectEmail(client.invited_email ?? client.email ?? "");
                  setConnectOpen(true);
                }}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                <UserPlus className="w-3 h-3" /> Connect with Trace user
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-2.5">
        {cards.map(({ kind, Icon, title, rows }) => (
          <button key={kind} onClick={() => setEditorOpen(kind)} className="w-full text-left">
            <Card className="p-4 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-3 pb-3">
                <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tap to edit</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
              <div className="space-y-0">
                {rows.map((row) => <FieldLine key={row.label} label={row.label} value={row.value} />)}
              </div>
            </Card>
          </button>
        ))}

        {!isAnonymous && (
          <AccountContractCard
            clientId={client.id}
            ownerUserId={user?.id ?? ""}
            contractUrl={client.contract_url}
            onChange={load}
          />
        )}

        {isAnonymous && (
          <Card className="p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Sign in to attach a signed contract, invite this client on Trace, and submit reports.
            </p>
            <div className="pt-2"><SignInLink /></div>
          </Card>
        )}

        <div className="pt-4">
          <Button
            variant="ghost"
            className="w-full h-11 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete client
          </Button>
        </div>
      </div>

      <AccountFocusEditor
        open={editorOpen !== null}
        kind={editorOpen}
        clientId={client.id}
        initial={client}
        onClose={() => setEditorOpen(null)}
        onSaved={() => { setEditorOpen(null); load(); }}
        onSave={isAnonymous ? saveAnonymous : undefined}
      />

      {/* Connect with Trace — invite sheet */}
      <Sheet open={connectOpen} onOpenChange={(v) => { if (!v) setConnectOpen(false); }}>
        <SheetContent side="bottom" className="rounded-t-3xl p-0 flex flex-col max-h-[calc(100dvh-1rem)]">
          <SheetHeader className="text-left px-5 pt-4 pb-3 shrink-0">
            <SheetTitle className="text-lg flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Connect with Trace user
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Invite {client.name} to Trace so you can submit reports directly. They'll see your invite the next time they sign in.
            </p>
          </SheetHeader>
          <div className="px-5 pb-4 space-y-3 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Client email</Label>
              <Input
                type="email"
                inputMode="email"
                value={connectEmail}
                onChange={(e) => setConnectEmail(e.target.value)}
                placeholder="contact@example.com"
                className="h-11 rounded-xl"
                disabled={connStatus === "accepted"}
              />
            </div>
            {connStatus === "pending" && (
              <p className="text-[11px] text-muted-foreground">
                Invite previously sent to <span className="font-medium text-foreground">{client.invited_email}</span>. Sending again will resend it.
              </p>
            )}
            {connStatus === "accepted" && (
              <p className="text-[11px] text-nav-bg">Already connected.</p>
            )}
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-border bg-card shrink-0">
            <Button variant="ghost" className="flex-1 h-11 rounded-xl" onClick={() => setConnectOpen(false)} disabled={sendingInvite}>
              Cancel
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl gap-2"
              onClick={sendInvite}
              disabled={sendingInvite || !connectEmail.trim() || connStatus === "accepted"}
            >
              {sendingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {connStatus === "pending" ? "Resend invite" : "Send invite"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {client.kind === "both"
                ? "This client also exists as a freelancer. It will be removed from Clients but kept in your Freelancers view."
                : "All data associated with this client — contact, commercial terms, business details and contract — will be permanently lost. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Proceed"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountProfilePage;
