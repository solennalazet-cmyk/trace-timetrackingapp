import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validatePaymentAmount, paymentLockKey } from "@/lib/payment-amount";
import { runExclusive } from "@/lib/action-lock";

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reportId: string | null;
  currency: string;
  totalAmount: number;
  alreadyPaid: number;
  recorderUserId: string;
  onRecorded?: () => void;
}

const toLocalDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const RecordPaymentSheet = ({ open, onOpenChange, reportId, currency, totalAmount, alreadyPaid, recorderUserId, onRecorded }: Props) => {
  const sym = CURRENCY_SYMBOLS[currency] ?? "€";
  const outstanding = Math.max(0, Number(totalAmount) - Number(alreadyPaid));
  const [amount, setAmount] = useState<string>(outstanding.toFixed(2));
  const [date, setDate] = useState<string>(toLocalDateKey(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(outstanding.toFixed(2));
      setDate(toLocalDateKey(new Date()));
      setNote("");
    }
  }, [open, outstanding]);

  const handleSave = async () => {
    if (!reportId || saving) return;
    const check = validatePaymentAmount(amount, outstanding);
    if (!check.ok) {
      toast.error(check.message);
      return;
    }
    const amountToSave = check.amount ?? 0;
    setSaving(true);
    const { error } = await runExclusive(
      paymentLockKey(reportId, amountToSave, date),
      async () =>
        await supabase.from("report_payments").insert({
          submitted_report_id: reportId,
          amount: amountToSave,
          currency,
          paid_at: date,
          note: note.trim() || null,
          recorded_by_user_id: recorderUserId,
        }),
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded.");
    onRecorded?.();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Record payment</SheetTitle>
          <SheetDescription>
            Outstanding: <span className="font-mono font-semibold text-foreground">{sym}{outstanding.toFixed(2)}</span>
            <span className="text-muted-foreground"> of {sym}{Number(totalAmount).toFixed(2)}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount ({sym})</Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Paid on</Label>
            <Input
              id="pay-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Textarea
              id="pay-note"
              placeholder="e.g. Bank transfer ref #1234"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <Button
            className="w-full rounded-xl h-12 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save payment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RecordPaymentSheet;
