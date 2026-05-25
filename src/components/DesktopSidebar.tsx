import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Timer, BarChart3, CheckSquare, Briefcase, Settings, CreditCard, LogOut, LogIn, Info, MessageSquare, Sparkles, User, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";
import SettingsModal from "./SettingsModal";
import AccountModal from "./AccountModal";
import AuthModal from "./AuthModal";
import HowTraceWorksModal from "./HowTraceWorksModal";
import AboutModal from "./AboutModal";
import FeedbackModal from "./FeedbackModal";
import WhatsNewModal from "./WhatsNewModal";

const navItems = [
  { path: "/", label: "Start", icon: Timer },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/timeline", label: "Done", icon: CheckSquare },
  { path: "/clients", label: "Projects", icon: Briefcase },
];

const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "";

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  // Workaround: primary yellow is unreadable on light card bg, so use foreground in light mode
  const activeColor = isDark ? "hsl(var(--primary))" : "hsl(var(--foreground))";
  const activeBg = isDark ? "hsl(var(--primary) / 0.12)" : "hsl(var(--foreground) / 0.08)";

  const planBadge = () => {
    if (!profile) return null;
    switch (profile.plan) {
      case "trial":
      case "free":
        return <span className="text-[10px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">FREE</span>;
      case "pro":
        return (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{
              background: "linear-gradient(135deg, hsl(43, 96%, 56%), hsl(53, 98%, 77%))",
              color: "hsl(222, 34%, 16%)",
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
    <aside
      className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:py-6 lg:px-4 lg:border-r border-border/40 bg-card/40 backdrop-blur-md"
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 px-2 mb-8" aria-label="Trace home">
        <img src={logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
        <span className="font-mono text-xl font-bold text-timer-display">Trace</span>
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: isActive ? activeBg : "transparent",
                color: isActive ? activeColor : "hsl(var(--foreground))",
              }}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />


      {/* More links dropdown */}
      <div className="mb-3">
        <button
          onClick={() => setMoreMenuOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-expanded={moreMenuOpen}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">More</span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform shrink-0"
            style={{ transform: moreMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
        {moreMenuOpen && (
          <div className="flex flex-col gap-0.5 mt-0.5">
            <button onClick={() => setHowItWorksOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <Info className="w-3.5 h-3.5" /> How Trace works
            </button>
            {user && (
              <>
                <button onClick={() => setWhatsNewOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  <Sparkles className="w-3.5 h-3.5" /> What's new
                </button>
                <button onClick={() => setFeedbackOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  <MessageSquare className="w-3.5 h-3.5" /> Send feedback
                </button>
                <button onClick={() => setAboutOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  <Info className="w-3.5 h-3.5" /> About
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Account section */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-3">
        {user ? (
          <>
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="w-full flex items-center gap-2.5 text-left"
              aria-expanded={accountMenuOpen}
            >
              <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                {initials || <User className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.full_name || "User"}</p>
                <div className="flex items-center gap-1.5">
                  {planBadge()}
                  <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
                </div>
              </div>
              <ChevronDown
                className="w-4 h-4 text-muted-foreground transition-transform shrink-0"
                style={{ transform: accountMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {accountMenuOpen && (
              <div className="flex flex-col gap-0.5 pt-2 mt-2 border-t border-border/40">
                <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted/50 transition-colors">
                  <Settings className="w-3.5 h-3.5" /> Settings
                </button>
                <button onClick={() => setAccountOpen(true)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted/50 transition-colors">
                  <CreditCard className="w-3.5 h-3.5" /> Account & Subscription
                </button>
                <button onClick={handleSignOut} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted/50 transition-colors text-muted-foreground">
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-4 h-4" /> Sign in
          </button>
        )}
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AccountModal open={accountOpen} onOpenChange={setAccountOpen} />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} onShowHowItWorks={() => setHowItWorksOpen(true)} />
      <HowTraceWorksModal open={howItWorksOpen} onOpenChange={setHowItWorksOpen} />
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <WhatsNewModal open={whatsNewOpen} onOpenChange={setWhatsNewOpen} />
    </aside>
  );
};

export default DesktopSidebar;
