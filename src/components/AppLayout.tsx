import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";
import DesktopSidebar from "./DesktopSidebar";
import DesktopRightPanel from "./DesktopRightPanel";
import ReportsRightPanel from "./ReportsRightPanel";
import AuthModal from "./AuthModal";

const AppLayout = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const location = useLocation();
  const isReports = location.pathname === "/reports";

  return (
    <div className="gradient-bg min-h-screen">
      <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)_340px] lg:min-h-screen">
        <DesktopSidebar />

        <div className="relative max-w-[420px] mx-auto min-h-screen w-full lg:max-w-none lg:mx-0">
          {/* Mobile header only */}
          <div className="lg:hidden">
            <Header />
          </div>

          <div className="pt-14 lg:pt-0">
            <main className="pb-20 px-4 lg:pb-8 lg:px-8 lg:pt-20 lg:flex lg:flex-col lg:items-center">
              <div className="w-full lg:max-w-[480px]">
                <Outlet />
              </div>
            </main>
          </div>

          {/* Mobile bottom nav only */}
          <div className="lg:hidden">
            <BottomNav />
          </div>
        </div>

        {isReports ? <ReportsRightPanel /> : <DesktopRightPanel />}
      </div>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
};

export default AppLayout;
