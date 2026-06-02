import { Card } from "@/components/ui/card";
import { Inbox, Wallet, Activity, Users } from "lucide-react";

const sections = [
  { icon: Inbox, title: "Pending reports", desc: "Reports awaiting your review will appear here." },
  { icon: Wallet, title: "Payments due", desc: "Approved reports awaiting payment." },
  { icon: Activity, title: "Recent activity", desc: "Submissions, approvals and payments." },
  { icon: Users, title: "Attendance snapshot", desc: "Recent completed sessions per worker." },
];

const EmployerHomePage = () => {
  return (
    <div className="pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">Your employer dashboard.</p>
      </header>

      {sections.map(({ icon: Icon, title, desc }) => (
        <Card key={title} className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              <p className="text-[11px] text-muted-foreground/70 mt-2 italic">Activates once workers submit reports.</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default EmployerHomePage;
