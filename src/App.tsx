import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import { WeekStartProvider } from "./contexts/WeekStartContext";
import AppLayout from "./components/AppLayout";
import StartPage from "./pages/StartPage";
import ReportsPage from "./pages/ReportsPage";
import TimelinePage from "./pages/TimelinePage";
import ClientsPage from "./pages/ClientsPage";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { useEffect, useState } from "react";
import { applyColorTheme, getStoredColorTheme } from "./hooks/useColorTheme";

const queryClient = new QueryClient();

function useWeekStartFromSettings(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [weekStart, setWeekStart] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(() => {
    try {
      const raw = localStorage.getItem("trace_user_settings");
      if (raw) {
        const v = JSON.parse(raw).week_start_day;
        if (typeof v === "number" && v >= 0 && v <= 6) return v as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      }
    } catch {}
    return 1;
  });

  useEffect(() => {
    // Listen for settings changes (settings modal writes to localStorage)
    const handler = () => {
      try {
        const raw = localStorage.getItem("trace_user_settings");
        if (raw) {
          const v = JSON.parse(raw).week_start_day;
          if (typeof v === "number" && v >= 0 && v <= 6) setWeekStart(v as 0 | 1 | 2 | 3 | 4 | 5 | 6);
        }
      } catch {}
    };
    window.addEventListener("storage", handler);
    // Also poll on a custom event for same-tab updates
    const interval = setInterval(handler, 2000);
    return () => { window.removeEventListener("storage", handler); clearInterval(interval); };
  }, []);

  return weekStart;
}

/** Restore persisted light/dark mode + color theme on startup */
function useRestoreTheme() {
  useEffect(() => {
    applyColorTheme(getStoredColorTheme());
    try {
      const raw = localStorage.getItem("trace_user_settings");
      if (raw) {
        const settings = JSON.parse(raw);
        if (settings.theme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    } catch {}
  }, []);
}

const AppInner = () => {
  useRestoreTheme();
  const weekStart = useWeekStartFromSettings();
  return (
    <WeekStartProvider value={weekStart}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<StartPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/clients" element={<ClientsPage />} />
          </Route>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </WeekStartProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner
        position="bottom-center"
        toastOptions={{
          style: {
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            borderRadius: "12px",
            padding: "12px 20px",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 500,
            fontSize: "14px",
            border: "1px solid hsl(var(--border))",
          },
          duration: 3000,
        }}
      />
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
