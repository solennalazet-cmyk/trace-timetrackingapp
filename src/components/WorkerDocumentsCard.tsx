import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderPlus, Upload, Trash2, ExternalLink, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  clientId: string;
  employerUserId: string;
}

interface DocRow {
  id: string;
  storage_path: string;
  filename: string;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
}

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = ".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv";

const fmtSize = (b: number | null) => {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const buildPath = (employerUserId: string, clientId: string, file: File) => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${employerUserId}/${clientId}/docs/${Date.now()}_${safe}`;
};

const WorkerDocumentsCard = ({ clientId, employerUserId }: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("worker_documents")
      .select("id, storage_path, filename, size_bytes, content_type, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setDocs((data ?? []) as DocRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const pick = () => {
    if (docs.length >= MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} documents per freelancer.`);
      return;
    }
    inputRef.current?.click();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (!employerUserId) { toast.error("Not signed in."); return; }

    const room = MAX_FILES - docs.length;
    if (files.length > room) {
      toast.error(`Only ${room} more document${room === 1 ? "" : "s"} can be added (max ${MAX_FILES}).`);
      return;
    }
    const oversize = files.find((f) => f.size > MAX_BYTES);
    if (oversize) {
      toast.error(`"${oversize.name}" is over 10 MB. Each file must be ≤ 10 MB.`);
      return;
    }

    setBusy(true);
    for (const file of files) {
      const path = buildPath(employerUserId, clientId, file);
      const up = await supabase.storage.from("worker-cvs").upload(path, file, { upsert: false });
      if (up.error) { toast.error(`${file.name}: ${up.error.message}`); continue; }
      const { error } = await supabase.from("worker_documents").insert({
        client_id: clientId,
        employer_user_id: employerUserId,
        storage_path: path,
        filename: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
      });
      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        try { await supabase.storage.from("worker-cvs").remove([path]); } catch {}
      }
    }
    setBusy(false);
    toast.success("Document(s) uploaded.");
    load();
  };

  const openDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("worker-cvs").createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? "Could not open."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const removeDoc = async (doc: DocRow) => {
    setBusy(true);
    try { await supabase.storage.from("worker-cvs").remove([doc.storage_path]); } catch {}
    const { error } = await supabase.from("worker_documents").delete().eq("id", doc.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Document removed.");
    load();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
          <FolderPlus className="w-4 h-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Supporting documents</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {docs.length}/{MAX_FILES} files · max 10 MB each · PDF, images, Word, Excel
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      {!loading && docs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <button
                onClick={() => openDoc(d.storage_path)}
                className="flex-1 min-w-0 text-left"
                title={d.filename}
              >
                <p className="text-xs font-medium truncate">{d.filename}</p>
                <p className="text-[10px] text-muted-foreground">{fmtSize(d.size_bytes)}</p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => openDoc(d.storage_path)}
                aria-label="Open"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeDoc(d)}
                disabled={busy}
                aria-label="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={pick}
        disabled={busy || docs.length >= MAX_FILES}
        className="w-full h-9 rounded-xl text-xs mt-3"
        variant={docs.length === 0 ? "default" : "outline"}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {docs.length === 0 ? "Upload documents" : "Add more"}
      </Button>
    </Card>
  );
};

export default WorkerDocumentsCard;
