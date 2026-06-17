import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (firstName: string) => Promise<void>;
}

const AddFreelancerModal = ({ open, onOpenChange, onCreate }: Props) => {
  const [firstName, setFirstName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setFirstName(""); setBusy(false); } }, [open]);

  const submit = async () => {
    const v = firstName.trim();
    if (!v || busy) return;
    setBusy(true);
    try { await onCreate(v); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-3rem)] max-w-[400px] rounded-2xl p-6">
        <DialogHeader className="space-y-1.5">
          <DialogTitle>Add a freelancer</DialogTitle>
          <p className="text-xs text-muted-foreground">Just a first name to get started. You can fill the rest from their profile.</p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="fl-first">First name</Label>
            <Input
              id="fl-first"
              type="text"
              placeholder="e.g. Jacqueline"
              className="h-11 rounded-xl"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              autoFocus
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1 rounded-xl h-11" onClick={submit} disabled={!firstName.trim() || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create profile"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddFreelancerModal;
