import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";

const WorkersPage = () => {
  return (
    <div className="pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Workers</h1>
        <p className="text-sm text-muted-foreground">People who submit reports to you.</p>
      </header>

      <Card className="p-6 text-center">
        <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">No workers yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Invite a worker by email — they'll appear here once connected.
        </p>
      </Card>
    </div>
  );
};

export default WorkersPage;
