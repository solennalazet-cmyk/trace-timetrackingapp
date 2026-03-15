import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

const StartPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-2">
        <h1 className="font-mono text-5xl font-bold text-timer-display">00:00</h1>
        <p className="text-sm text-muted-foreground">Tap to start tracking</p>
      </div>
      <Button
        size="lg"
        className="w-20 h-20 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
        aria-label="Start timer"
      >
        <Timer className="w-8 h-8" />
      </Button>
    </div>
  );
};

export default StartPage;
