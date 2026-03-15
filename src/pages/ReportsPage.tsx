import { BarChart3 } from "lucide-react";

const ReportsPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <BarChart3 className="w-12 h-12 text-muted-foreground opacity-40" />
      <p className="text-muted-foreground text-sm text-center">No time entries yet.<br />Start tracking to see your reports.</p>
    </div>
  );
};

export default ReportsPage;
