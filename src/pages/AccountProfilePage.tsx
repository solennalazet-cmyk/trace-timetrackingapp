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
    if (!client) return;
    setDeleting(true);
    let error;
    if (client.kind === "both") {
      ({ error } = await supabase.from("clients").update({ kind: "contractor" }).eq("id", client.id));
    } else {
      ({ error } = await supabase.from("clients").delete().eq("id", client.id));
    }
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Client deleted.");
    setDeleteOpen(false);
    navigate("/clients");
  };

  if (loading) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground px-4">Loading…</div>;
  }
  if (!client) {
    return <div className="pt-6 pb-24 text-sm text-muted-foreground px-4">Client not found.</div>;
  }

  const sym = CURRENCY_SYMBOLS[client.currency ?? "EUR"] ?? "€";

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

        <AccountContractCard
          clientId={client.id}
          ownerUserId={user?.id ?? ""}
          contractUrl={client.contract_url}
          onChange={load}
        />

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
      />

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
