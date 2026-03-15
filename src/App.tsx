import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import AppLayout from "./components/AppLayout";
import StartPage from "./pages/StartPage";
import ReportsPage from "./pages/ReportsPage";
import TimelinePage from "./pages/TimelinePage";
import ClientsPage from "./pages/ClientsPage";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#3D1F3F",
            color: "hsl(0, 0%, 95%)",
            borderRadius: "12px",
            padding: "12px 20px",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 500,
            fontSize: "14px",
            border: "none",
          },
          duration: 3000,
        }}
      />
      <AuthProvider>
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
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
