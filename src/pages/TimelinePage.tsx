import { Clock } from "lucide-react";

const TimelinePage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Clock className="w-12 h-12 text-muted-foreground opacity-40" />
      <p className="text-muted-foreground text-sm text-center">Your timeline is empty.<br />Tracked sessions will appear here.</p>
    </div>
  );
};

export default TimelinePage;
