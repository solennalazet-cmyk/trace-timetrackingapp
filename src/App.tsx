import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import { RoleProvider, useRole } from "./contexts/RoleContext";
import { WeekStartProvider } from "./contexts/WeekStartContext";
import AppLayout from "./components/AppLayout";
import RoleChoiceOverlay from "./components/RoleChoiceOverlay";
import { lazy, Suspense, useEffect, useState } from "react";
import { applyColorTheme, getStoredColorTheme } from "./hooks/useColorTheme";

// Route-level code splitting — keeps the initial JS payload small for the
// Android WebView cold start. Each page becomes its own chunk fetched on
// navigation rather than parsed up front.
const StartPage = lazy(() => import("./pages/StartPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const AccountProfilePage = lazy(() => import("./pages/AccountProfilePage"));
const EmployerHomePage = lazy(() => import("./pages/EmployerHomePage"));
const EmployerCalendarPage = lazy(() => import("./pages/EmployerCalendarPage"));
const WorkersPage = lazy(() => import("./pages/WorkersPage"));
const WorkerProfilePage = lazy(() => import("./pages/WorkerProfilePage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile networks are flaky and the WebView often re-focuses when the
      // status bar / keyboard appears. Disable the noisy refetches that fire
      // on every focus change and keep results fresh for 30s by default.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

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
    // React to the in-app event the settings modal dispatches on save, plus
    // cross-tab storage events. No polling — the previous 2s setInterval was
    // a CPU/battery tax on Android with no observable benefit.
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
    window.addEventListener("trace-settings-changed", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("trace-settings-changed", handler);
    };
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

const RouteRoleSync = () => {
  const { activeRole, setActiveRole } = useRole();
  const location = useLocation();
  useEffect(() => {
    const p = location.pathname;
    const isEmployerRoute = p === "/employer" || p.startsWith("/employer/") || p === "/workers" || p.startsWith("/workers/");
    const isWorkerRoute =
      p === "/" || p === "/reports" || p === "/timeline" || p === "/clients" || p.startsWith("/clients/") || p === "/payments";
    if (isEmployerRoute && activeRole !== "employer") setActiveRole("employer");
    else if (isWorkerRoute && activeRole !== "worker") setActiveRole("worker");
  }, [location.pathname, activeRole, setActiveRole]);
  return null;
};

const AppInner = () => {
  useRestoreTheme();
  const { activeRole } = useRole();
  const weekStart = useWeekStartFromSettings();

  useEffect(() => {
    const root = document.documentElement;
    if (activeRole === "employer") {
      root.classList.add("employer");
    } else {
      root.classList.remove("employer");
    }
  }, [activeRole]);


  return (
    <WeekStartProvider value={weekStart}>
      <BrowserRouter>
        <RoleChoiceOverlay />
        <Suspense fallback={<div className="min-h-screen" aria-hidden />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<StartPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/timeline" element={<Navigate to="/reports" replace />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/:id" element={<AccountProfilePage />} />
              <Route path="/employer" element={<EmployerHomePage />} />
              <Route path="/employer/calendar" element={<EmployerCalendarPage />} />
              <Route path="/workers" element={<WorkersPage />} />
              <Route path="/workers/:id" element={<WorkerProfilePage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/account" element={<AccountPage />} />
            </Route>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
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
        <RoleProvider>
          <AppInner />
        </RoleProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

