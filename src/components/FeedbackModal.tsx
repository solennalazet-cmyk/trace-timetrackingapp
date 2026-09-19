import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getDiagnosticsContext } from "@/lib/error-log";


interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FeedbackModal = ({ open, onOpenChange }: FeedbackModalProps) => {
  const { user } = useAuth();
  const [type, setType] = useState<string>("suggestion");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickScreenshot = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("That image is too large — please keep it under 10 MB.");
      return;
    }
    setScreenshot(file);
    setPreview(URL.createObjectURL(file));
  };

  const clearScreenshot = () => {
    if (preview) URL.revokeObjectURL(preview);
    setScreenshot(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);

    // Upload the optional screenshot first so the report arrives with it.
    let screenshotPath: string | null = null;
    if (screenshot && user?.id) {
      const ext = (screenshot.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("feedback-screenshots")
        .upload(path, screenshot, { contentType: screenshot.type, upsert: false });
      if (uploadError) {
        setLoading(false);
        toast.error("Couldn't attach the image — try again or send without it.");
        return;
      }
      screenshotPath = path;
    }
    // Attach technical context automatically so bug reports arrive with the
    // recent runtime errors, screen and device info already included.
    const context = getDiagnosticsContext({
      userEmail: user?.email ?? null,
      appVersion: (import.meta as any).env?.MODE ?? "production",
    });

    const { error } = await supabase.from("user_feedback").insert({
      user_id: user?.id ?? null,
      type,
      message: message.trim(),
      context: context as any,
    });

    setLoading(false);

    if (error) {
      toast.error("Could not send — check your connection and try again.");
      return;
    }

    toast.success("Thanks — we read every message.");
    setMessage("");
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] rounded-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-message" className="text-sm">Message</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind…"
              rows={4}
              className="rounded-xl"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full rounded-[28px] h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={loading || !message.trim()}
          >
            {loading ? "Sending…" : "Send"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;
