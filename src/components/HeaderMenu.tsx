import { useState } from "react";
import { HelpCircle, Info, LogIn } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import HowTraceWorksModal from "./HowTraceWorksModal";
import AboutModal from "./AboutModal";

const HeaderMenu = () => {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Menu"
          >
            <HelpCircle className="w-5 h-5 text-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 rounded-xl border backdrop-blur-xl"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
          }}
        >
          <DropdownMenuItem onClick={() => setHowItWorksOpen(true)} className="cursor-pointer">
            <Info className="w-4 h-4 mr-2" />
            How Trace Works
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAboutOpen(true)} className="cursor-pointer">
            <Info className="w-4 h-4 mr-2" />
            About Trace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer">
            <LogIn className="w-4 h-4 mr-2" />
            Sign In
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <HowTraceWorksModal open={howItWorksOpen} onOpenChange={setHowItWorksOpen} />
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
};

export default HeaderMenu;
