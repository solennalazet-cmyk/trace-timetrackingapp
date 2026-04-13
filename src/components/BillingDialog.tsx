import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, CreditCard, ArrowLeft, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type RoundingSettings, DEFAULT_ROUNDING, aggregateWithRounding, entryDisplayValues, hasActiveRounding, describeRounding } from "@/lib/rounding";

interface ClientBillData {
  id: string;
  name: string;
  currency: string;
  totalHours: number;
  billableHours: number;
  unbillableHours: number;
  billableAmount: number;
  entryCount: number;
}

interface BillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  rounding?: RoundingSettings;
  /** When set, skip client selection and scope to this client */
  preselectedClientId?: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CAD: "C$", AUD: "A$", CHF: "CHF" };

const BillingDialog = ({ open, onOpenChange, onComplete, rounding = DEFAULT_ROUNDING, preselectedClientId }: BillingDialogProps) => {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [clientsData, setClientsData] = useState<ClientBillData[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setSelectedClients(new Set());
    setDateFrom(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setDateTo(new Date());

    // Load clients with unbilled entries
    (async () => {
      const { data: clients } = await supabase.from("clients").select("id, name, currency").eq("user_id", user.id);
      const { data: entries } = await supabase.from("time_entries")
        .select("client_id, duration_minutes, billable_value, rate_amount, rate_unit, billable")
        .eq("user_id", user.id).eq("billing_status", "unbilled").not("client_id", "is", null).is("deleted_at", null);

      // Group entries by client
      const grouped: Record<string, typeof entries> = {};
      entries?.forEach((e) => {
        if (!e.client_id) return;
        if (!grouped[e.client_id]) grouped[e.client_id] = [];
        grouped[e.client_id]!.push(e);
      });

      const data = (clients ?? []).filter((c) => grouped[c.id]).map((c) => {
        const clientEntries = grouped[c.id]!;
        const billableEntries = clientEntries.filter((e) => e.billable);
        const unbillableEntries = clientEntries.filter((e) => !e.billable);

        // Total time = all entries
        const { totalMinutes: totalMins } = aggregateWithRounding(clientEntries, rounding);
        // Billable amount = only billable entries
        const { totalMinutes: billableMins, totalValue: billableVal } = aggregateWithRounding(billableEntries, rounding);
        const { totalMinutes: unbillableMins } = aggregateWithRounding(unbillableEntries, rounding);

        return {
          id: c.id, name: c.name, currency: c.currency ?? "EUR",
          totalHours: totalMins / 60,
          billableHours: billableMins / 60,
          unbillableHours: unbillableMins / 60,
          billableAmount: billableVal,
          entryCount: billableEntries.length,
        };
      });

      setClientsData(data);

      // If preselected, auto-select and skip to step 2
      if (preselectedClientId && data.some((c) => c.id === preselectedClientId)) {
        setSelectedClients(new Set([preselectedClientId]));
        setStep(2);
      } else {
        setStep(1);
      }
    })();
  }, [open, user]);

  const toggleClient = (id: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selected = clientsData.filter((c) => selectedClients.has(c.id));
  const totalAmount = selected.reduce((s, c) => s + c.billableAmount, 0);
  const totalBillableHours = selected.reduce((s, c) => s + c.billableHours, 0);
  const totalEntries = selected.reduce((s, c) => s + c.entryCount, 0);
  const sym = selected.length > 0 ? CURRENCY_SYMBOLS[selected[0].currency] ?? "€" : "€";

  const handleGeneratePDF = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const fromStr = format(dateFrom, "yyyy-MM-dd");
      const toStr = format(dateTo, "yyyy-MM-dd");

      for (const client of selected) {
        // Get only BILLABLE unbilled entries
        const { data: entries } = await supabase.from("time_entries")
          .select("id, entry_date, duration_minutes, billable_value, notes, rate_amount, rate_unit, billable")
          .eq("user_id", user.id).eq("client_id", client.id)
          .eq("billing_status", "unbilled")
          .eq("billable", true)
          .is("deleted_at", null)
          .gte("entry_date", fromStr).lte("entry_date", toStr);

        if (!entries || entries.length === 0) continue;

        // Scope-aware totals (all entries here are billable)
        const { totalMinutes: totalMins, totalValue: total } = aggregateWithRounding(entries, rounding);

        // Create invoice record
        const { data: invoice } = await supabase.from("invoices").insert({
          user_id: user.id, client_id: client.id, currency: client.currency,
          date_range_start: fromStr, date_range_end: toStr,
          total_amount: total, status: "sent", sent_at: new Date().toISOString(),
        }).select("id").single();

        // Mark entries as billed
        const entryIds = entries.map((e) => e.id);
        await supabase.from("time_entries").update({
          billing_status: "billed", invoice_id: invoice?.id,
        }).in("id", entryIds);

        // Generate invoice text with post-rounding values only
        const lines = [
          `INVOICE — ${client.name}`,
          `Period: ${format(dateFrom, "d MMM yyyy")} – ${format(dateTo, "d MMM yyyy")}`,
          ``,
          `Date | Duration | Rate | Amount | Notes`,
          `---------------------------------------------`,
          ...entries.map((e) => {
            const { displayMinutes, displayValue } = entryDisplayValues(e, rounding);
            const h = Math.floor(displayMinutes / 60);
            const m = Math.round(displayMinutes % 60);
            return `${e.entry_date} | ${h}h${m}m | ${e.rate_amount ?? "-"}/${e.rate_unit ?? "-"} | ${sym}${displayValue.toFixed(2)} | ${e.notes ?? ""}`;
          }),
          ``,
          `Total: ${Math.floor(totalMins / 60)}h ${Math.round(totalMins % 60)}m — ${sym}${total.toFixed(2)}`,
          ...(hasActiveRounding(rounding) ? [`Rounding: ${describeRounding(rounding)}`] : []),
        ];

        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `invoice-${client.name.replace(/\s+/g, "-")}-${fromStr}.txt`;
        a.click(); URL.revokeObjectURL(url);
      }

      toast.success("Invoice PDF downloaded.");
      onOpenChange(false);
      onComplete();
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate invoice.");
    }
    setGenerating(false);
  };

  const isPreselected = !!preselectedClientId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-2xl max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{isPreselected && selected.length === 1 ? `Bill ${selected[0].name}` : "Bill Clients"}</DialogTitle>
        </DialogHeader>

        {step === 1 && !isPreselected && (
          <div className="px-6 pb-6 pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Select clients to bill</p>
            {clientsData.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No unbilled entries.</p>}
            {clientsData.map((c) => (
              <label key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 cursor-pointer">
                <Checkbox checked={selectedClients.has(c.id)} onCheckedChange={() => toggleClient(c.id)} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.billableHours.toFixed(1)}h billable · {CURRENCY_SYMBOLS[c.currency] ?? "€"}{c.billableAmount.toFixed(2)}
                    {c.unbillableHours > 0.01 && ` · ${c.unbillableHours.toFixed(1)}h unbillable`}
                  </p>
                </div>
              </label>
            ))}
            <Button className="w-full bg-primary text-primary-foreground rounded-[28px] h-12 font-bold" disabled={selectedClients.size === 0} onClick={() => setStep(2)}>
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="px-6 pb-6 pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Select date range</p>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start text-left"><CalendarIcon className="w-4 h-4 mr-2" />{format(dateFrom, "d MMM yyyy")}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start text-left"><CalendarIcon className="w-4 h-4 mr-2" />{format(dateTo, "d MMM yyyy")}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-3">
              {!isPreselected && (
                <Button variant="outline" className="flex-1 rounded-[28px] h-12 font-bold" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              )}
              <Button className="flex-1 bg-primary text-primary-foreground rounded-[28px] h-12 font-bold" onClick={() => setStep(3)}>Review <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="px-6 pb-6 pt-4 space-y-3">
            <div className="p-3 rounded-xl bg-muted/50 space-y-1">
              {selected.map((c) => <p key={c.id} className="text-sm font-medium">{c.name}</p>)}
              <p className="text-xs text-muted-foreground">Period: {format(dateFrom, "d MMM")} – {format(dateTo, "d MMM yyyy")}</p>
              <p className="text-xs text-muted-foreground">Billable entries: {totalEntries} sessions · {totalBillableHours.toFixed(1)}h</p>
              <p className="font-mono text-lg font-bold">{sym}{totalAmount.toFixed(2)}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-[28px] h-12 font-bold" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button className="flex-1 bg-primary text-primary-foreground rounded-[28px] h-12 font-bold" onClick={() => setStep(4)}>Choose delivery <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="px-6 pb-6 pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">Choose delivery method</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-border opacity-50 cursor-not-allowed text-center space-y-2">
                <CreditCard className="w-6 h-6 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Send via Stripe</p>
                <p className="text-xs text-muted-foreground">Coming soon</p>
              </div>
              <button
                className="p-4 rounded-xl border-2 border-primary text-center space-y-2 hover:bg-primary/5 transition-colors"
                onClick={handleGeneratePDF}
                disabled={generating}
              >
                <FileText className="w-6 h-6 mx-auto text-foreground" />
                <p className="text-sm font-medium">Export as PDF</p>
                <p className="text-xs text-muted-foreground">Available now</p>
              </button>
            </div>
            <Button variant="outline" className="w-full rounded-[28px] h-10" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BillingDialog;
