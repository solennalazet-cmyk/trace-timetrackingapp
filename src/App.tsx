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
import AppErrorBoundary from "./components/AppErrorBoundary";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { applyColorTheme, getStoredColorTheme } from "./hooks/useColorTheme";
import { clearChunkReloadMarker, recoverFromChunkLoadError } from "./lib/chunk-recovery";

const lazyWithChunkRecovery = <T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) =>
  lazy(() =>
    loader()
      .then((module) => {
        clearChunkReloadMarker();
        return module;
      })
      .catch((error) => {
        if (recoverFromChunkLoadError(error)) {
          return new Promise<never>(() => {});
        }
        throw error;
      }),
  );


// Route-level code splitting — keeps the initial JS payload small for the
// Android WebView cold start. Each page becomes its own chunk fetched on
// navigation rather than parsed up front.
const StartPage = lazyWithChunkRecovery(() => import("./pages/StartPage"));
const ReportsPage = lazyWithChunkRecovery(() => import("./pages/ReportsPage"));
const ClientsPage = lazyWithChunkRecovery(() => import("./pages/ClientsPage"));
const AccountProfilePage = lazyWithChunkRecovery(() => import("./pages/AccountProfilePage"));
const EmployerHomePage = lazyWithChunkRecovery(() => import("./pages/EmployerHomePage"));
const EmployerCalendarPage = lazyWithChunkRecovery(() => import("./pages/EmployerCalendarPage"));
const WorkersPage = lazyWithChunkRecovery(() => import("./pages/WorkersPage"));
const WorkerProfilePage = lazyWithChunkRecovery(() => import("./pages/WorkerProfilePage"));
const PaymentsPage = lazyWithChunkRecovery(() => import("./pages/PaymentsPage"));
const AccountPage = lazyWithChunkRecovery(() => import("./pages/AccountPage"));
const ResetPassword = lazyWithChunkRecovery(() => import("./pages/ResetPassword"));
const NotFound = lazyWithChunkRecovery(() => import("./pages/NotFound"));
const PrivacyPage = lazyWithChunkRecovery(() => import("./pages/PrivacyPage"));

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

const AppInner = () => {
  useRestoreTheme();
  const { activeRole, roleLoaded } = useRole();
  const weekStart = useWeekStartFromSettings();

  useEffect(() => {
    const root = document.documentElement;
    if (activeRole === "employer") {
      root.classList.add("employer");
    } else {
      root.classList.remove("employer");
    }
  }, [activeRole]);

  // Guards so each role only sees its own screens. Visiting a route that
  // belongs to the other role bounces you to that role's home — no more
  // employer dashboard leaking into the freelancer view, or vice versa.
  const workerHome = "/";
  const employerHome = "/employer";

  const RequireRole = ({ role, children }: { role: "worker" | "employer"; children: JSX.Element }) => {
    // Never bounce while the saved role is still unknown — a reload would
    // otherwise throw the user back to the other role's home screen.
    if (!roleLoaded) return <div className="min-h-screen" aria-hidden />;
    if (activeRole !== role) {
      return <Navigate to={role === "worker" ? employerHome : workerHome} replace />;
    }
    return children;
  };

  // "/" is the freelancer's home; for employers it should land on /employer.
  const RoleAwareHome = () => {
    if (!roleLoaded) return <div className="min-h-screen" aria-hidden />;
    return activeRole === "employer" ? <Navigate to={employerHome} replace /> : <StartPage />;
  };

  return (
    <WeekStartProvider value={weekStart}>
      <BrowserRouter>
        <RoleChoiceOverlay />
        <AppErrorBoundary>
          <Suspense fallback={<div className="min-h-screen" aria-hidden />}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<RoleAwareHome />} />
                <Route path="/reports" element={<RequireRole role="worker"><ReportsPage /></RequireRole>} />
                <Route path="/timeline" element={<Navigate to="/reports" replace />} />
                <Route path="/clients" element={<RequireRole role="worker"><ClientsPage /></RequireRole>} />
                <Route path="/clients/:id" element={<RequireRole role="worker"><AccountProfilePage /></RequireRole>} />
                <Route path="/employer" element={<RequireRole role="employer"><EmployerHomePage /></RequireRole>} />
                <Route path="/employer/calendar" element={<RequireRole role="employer"><EmployerCalendarPage /></RequireRole>} />
                <Route path="/workers" element={<RequireRole role="employer"><WorkersPage /></RequireRole>} />
                <Route path="/workers/:id" element={<RequireRole role="employer"><WorkerProfilePage /></RequireRole>} />
                <Route path="/payments" element={<PaymentsPage />} />
                <Route path="/account" element={<AccountPage />} />
              </Route>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>
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

