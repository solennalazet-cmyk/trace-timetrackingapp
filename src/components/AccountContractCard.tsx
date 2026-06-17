import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSignature, Upload, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  clientId: string;
  ownerUserId: string;
  contractUrl: string | null;
  onChange: () => void;
}

const MAX_BYTES = 10 * 1024 * 1024;

const buildPath = (ownerUserId: string, clientId: string, file: File) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${ownerUserId}/${clientId}/contract_${Date.now()}_${safe}`;
};

const AccountContractCard = ({ clientId, ownerUserId, contractUrl, onChange }: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ownerUserId) { toast.error("Not signed in."); return; }
    if (file.size > MAX_BYTES) { toast.error("Max 10 MB."); return; }

    setBusy(true);
    if (contractUrl) {
      try { await supabase.storage.from("worker-cvs").remove([contractUrl]); } catch {}
    }
    const path = buildPath(ownerUserId, clientId, file);
    const up = await supabase.storage.from("worker-cvs").upload(path, file, { upsert: true });
    if (up.error) { setBusy(false); toast.error(up.error.message); return; }

    const { error } = await supabase.from("clients").update({ contract_url: path } as any).eq("id", clientId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract uploaded.");
    onChange();
  };

  const openFile = async () => {
    if (!contractUrl) return;
    const { data, error } = await supabase.storage.from("worker-cvs").createSignedUrl(contractUrl, 60 * 5);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? "Could not open."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const removeFile = async () => {
    if (!contractUrl) return;
    setBusy(true);
    try { await supabase.storage.from("worker-cvs").remove([contractUrl]); } catch {}
    const { error } = await supabase.from("clients").update({ contract_url: null } as any).eq("id", clientId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract removed.");
    onChange();
  };

  const filename = contractUrl ? contractUrl.split("/").pop()?.replace(/^contract_\d+_/, "") ?? "Contract" : null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
          <FileSignature className="w-4 h-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Contract</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {filename ?? "No file uploaded — PDF, image or Word, up to 10 MB."}
          </p>
        </div>
      </div>

      <input ref={inputRef} type="file" accept=".pdf,image/*,.doc,.docx" onChange={handleFile} className="hidden" />

      <div className="flex gap-2 mt-3">
        {contractUrl ? (
          <>
            <Button variant="outline" className="flex-1 h-9 rounded-xl text-xs" onClick={openFile} disabled={busy}>
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </Button>
            <Button variant="outline" className="flex-1 h-9 rounded-xl text-xs" onClick={pick} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Replace
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground" onClick={removeFile} disabled={busy} aria-label="Remove contract">
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <Button className="w-full h-9 rounded-xl text-xs" onClick={pick} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload contract
          </Button>
        )}
      </div>
    </Card>
  );
};

export default AccountContractCard;
