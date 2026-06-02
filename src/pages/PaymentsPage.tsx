import { Card } from "@/components/ui/card";
import { Wallet } from "lucide-react";

const PaymentsPage = () => {
  return (
    <div className="pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Track what's due and what's been paid.</p>
      </header>

      <Card className="p-6 text-center">
        <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">No payments yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Approved reports will appear here as Due, Partially Paid, or Paid.
        </p>
      </Card>
    </div>
  );
};

export default PaymentsPage;
