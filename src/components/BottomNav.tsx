import { Link, useLocation } from "react-router-dom";
import { Timer, BarChart3, CheckSquare, Briefcase } from "lucide-react";
import { getStoredColorTheme } from "@/hooks/useColorTheme";

const tabs = [
  { path: "/", label: "Start", icon: Timer },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/timeline", label: "Done", icon: CheckSquare },
  { path: "/clients", label: "Projects", icon: Briefcase },
];

const getThemeStyles = () => {
  const theme = getStoredColorTheme();
  const isDark = document.documentElement.classList.contains("dark");

  if (isDark) {
    return {
      bg: theme === "stormy" ? "rgba(30, 38, 54, 0.92)" : "rgba(24, 18, 36, 0.92)",
      active: "hsl(43, 96%, 56%)",
      inactive: "rgba(255, 255, 255, 0.55)",
      border: "rgba(255, 255, 255, 0.1)",
    };
  }

  if (theme === "stormy") {
    return {
      bg: "rgba(52, 63, 86, 0.88)",
      active: "hsl(53, 98%, 77%)",
      inactive: "rgba(255, 255, 255, 0.68)",
      border: "rgba(255, 255, 255, 0.14)",
    };
  }

  return {
    bg: "rgba(83, 45, 84, 0.88)",
    active: "hsl(53, 98%, 77%)",
    inactive: "rgba(255, 255, 255, 0.6)",
    border: "rgba(255, 255, 255, 0.15)",
  };
};

const BottomNav = () => {
  const location = useLocation();
  const colors = getThemeStyles();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] z-50"
      style={{
        backgroundColor: colors.bg,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderTop: `1px solid ${colors.border}`,
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
                color: isActive ? colors.active : colors.inactive,
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
