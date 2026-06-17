import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Handshake, Building2, ChevronRight, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import AccountFocusEditor, { type AccountEditorKind } from "@/components/AccountFocusEditor";
import AccountContractCard from "@/components/AccountContractCard";

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
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF",
};

const initials = (name: string) => (name?.trim()?.slice(0, 1) ?? "?").toUpperCase();

const AccountProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState<AccountEditorKind | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, email, phone, default_rate, currency, payment_terms_days, billing_notes, nif, business_address, contract_url, user_id, kind")
      .eq("id", id)
      .maybeSingle();
    if (error) toast.error(error.message);
    setAccount(data as AccountRow | null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!account) return;
    setDeleting(true);
    let error;
    if (account.kind === "both") {
      ({ error } = await supabase.from("clients").update({ kind: "contractor" }).eq("id", account.id));
    } else {
      ({ error } = await supabase.from("clients").delete().eq("id", account.id));
    }
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account deleted.");
    setDeleteOpen(false);
    navigate("/clients");
  };

  if (loading) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground px-4">Loading…</div>;
  }
  if (!account) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground px-4">Account not found.</div>;
  }

  const sym = CURRENCY_SYMBOLS[account.currency ?? "EUR"] ?? "€";

  type CardDef = { kind: AccountEditorKind; Icon: typeof Mail; title: string; summary: string };
  const cards: CardDef[] = [
    {
      kind: "contact",
      Icon: Mail,
      title: "Contact",
      summary: [account.email, account.phone].filter(Boolean).join(" · ") || "Add email and phone",
    },
    {
      kind: "commercial",
      Icon: Handshake,
      title: "Commercial agreement",
      summary: [
        account.default_rate != null ? `${sym}${account.default_rate}/h` : null,
        account.payment_terms_days != null ? `Net ${account.payment_terms_days}d` : null,
        account.billing_notes ? "Notes set" : null,
      ].filter(Boolean).join(" · ") || "Set rate, currency, payment terms",
    },
    {
      kind: "business",
      Icon: Building2,
      title: "Business details",
      summary: [
        account.nif ? `NIF ${account.nif}` : null,
        account.business_address ? account.business_address.split("\n")[0] : null,
      ].filter(Boolean).join(" · ") || "Add NIF / VAT and registered address",
    },
  ];

  return (
    <div className="pt-4 pb-24 px-4 space-y-5">
      <Seo title={`${account.name} — Account profile`} description={`Manage ${account.name}: contact, commercial agreement, business details and contract.`} path={`/clients/${account.id}`} />

      <button onClick={() => navigate("/clients")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Accounts
      </button>

      <header className="flex items-center gap-4 pt-1">
        <div className="h-16 w-16 rounded-full bg-foreground/10 text-foreground flex items-center justify-center text-2xl font-semibold shrink-0">
          {initials(account.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight truncate">{account.name}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {account.default_rate != null ? `${sym}${account.default_rate}/hour` : "Rate not set"}
          </p>
        </div>
      </header>

      <div className="space-y-2.5">
        {cards.map(({ kind, Icon, title, summary }) => (
          <button key={kind} onClick={() => setEditorOpen(kind)} className="w-full text-left">
            <Card className="p-4 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{summary}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </button>
        ))}

        <AccountContractCard
          clientId={account.id}
          ownerUserId={user?.id ?? ""}
          contractUrl={account.contract_url}
          onChange={load}
        />

        <div className="pt-4">
          <Button
            variant="ghost"
            className="w-full h-11 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete account
          </Button>
        </div>
      </div>

      <AccountFocusEditor
        open={editorOpen !== null}
        kind={editorOpen}
        clientId={account.id}
        initial={account}
        onClose={() => setEditorOpen(null)}
        onSaved={() => { setEditorOpen(null); load(); }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[380px] w-[calc(100vw-2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {account.kind === "both"
                ? "This account also exists as a freelancer. It will be removed from Accounts but kept in your Freelancers view."
                : "All data associated with this account — contact, commercial terms, business details and contract — will be permanently lost. This cannot be undone."}
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
