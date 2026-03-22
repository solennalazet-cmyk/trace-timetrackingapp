import { Link, useLocation } from "react-router-dom";
import { Timer, BarChart3, Clock, Briefcase } from "lucide-react";

const tabs = [
  { path: "/", label: "Start", icon: Timer },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/timeline", label: "Timeline", icon: Clock },
  { path: "/clients", label: "Projects", icon: Briefcase },
];

const BottomNav = () => {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] z-50"
      style={{
        backgroundColor: "rgba(83, 45, 84, 0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderTop: "1px solid rgba(255, 255, 255, 0.15)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className="flex flex-col items-center gap-1 px-3 py-2 transition-colors"
              style={{
                color: isActive
                  ? "hsl(53, 98%, 77%)"
                  : "rgba(255, 255, 255, 0.6)",
              }}
              aria-label={label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
