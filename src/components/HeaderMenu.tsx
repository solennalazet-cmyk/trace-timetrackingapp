import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleUser, Info, LogIn, LogOut, Settings, MessageSquare, Sparkles, User, CreditCard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import HowTraceWorksModal from "./HowTraceWorksModal";
import AboutModal from "./AboutModal";
import AuthModal from "./AuthModal";
import FeedbackModal from "./FeedbackModal";
import WhatsNewModal from "./WhatsNewModal";
import SettingsModal from "./SettingsModal";
import AccountModal from "./AccountModal";

const HeaderMenu = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  const planBadge = () => {
    if (!profile) return null;
    switch (profile.plan) {
      case "trial": {
        const days = profile.trial_started_at
          ? Math.max(0, 14 - Math.floor((Date.now() - new Date(profile.trial_started_at).getTime()) / 86400000))
          : 0;
        return <span className="text-[10px] font-bold bg-accent text-foreground px-1.5 py-0.5 rounded">TRIAL · {days}d left</span>;
      }
      case "free":
        return <span className="text-[10px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">FREE</span>;
      case "pro":
        return (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{
              background: "linear-gradient(135deg, hsl(43, 96%, 56%), hsl(53, 98%, 77%))",
              color: "hsl(217, 33%, 17%)",
            }}
          >
            PRO ✦
          </span>
        );
      default:
        return null;
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {user ? (
            <button
              className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account menu"
            >
              {initials || <User className="w-4 h-4" />}
            </button>
          ) : (
            <button
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Menu"
            >
              <CircleUser className="w-5 h-5 text-foreground" />
            </button>
          )}
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
          {user && (
            <>
              <div className="px-3 py-2 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{profile?.full_name || "User"}</p>
                  {planBadge()}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="cursor-pointer">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAccountOpen(true)} className="cursor-pointer">
                <CreditCard className="w-4 h-4 mr-2" />
                Account & Subscription
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={() => setHowItWorksOpen(true)} className="cursor-pointer">
            <Info className="w-4 h-4 mr-2" />
            How Trace Works
          </DropdownMenuItem>

          {user && (
            <>
              <DropdownMenuItem onClick={() => setWhatsNewOpen(true)} className="cursor-pointer">
                <Sparkles className="w-4 h-4 mr-2" />
                What's New
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFeedbackOpen(true)} className="cursor-pointer">
                <MessageSquare className="w-4 h-4 mr-2" />
                Send Feedback
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAboutOpen(true)} className="cursor-pointer">
                <Info className="w-4 h-4 mr-2" />
                About Trace
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {user ? (
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setAuthOpen(true)} className="cursor-pointer">
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <HowTraceWorksModal open={howItWorksOpen} onOpenChange={setHowItWorksOpen} />
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} onShowHowItWorks={() => setHowItWorksOpen(true)} />
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <WhatsNewModal open={whatsNewOpen} onOpenChange={setWhatsNewOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AccountModal open={accountOpen} onOpenChange={setAccountOpen} />
    </>
  );
};

export default HeaderMenu;
