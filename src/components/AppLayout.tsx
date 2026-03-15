import { useState } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";
import AnonymousBanner from "./AnonymousBanner";
import TrialBanner from "./TrialBanner";
import AuthModal from "./AuthModal";

const AppLayout = () => {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="gradient-bg min-h-screen">
      <div className="relative max-w-[420px] mx-auto min-h-screen">
        <Header />
        <div className="pt-14">
          <AnonymousBanner onSignIn={() => setAuthOpen(true)} />
          <TrialBanner />
        </div>
        <main className="pb-20 px-4">
          <Outlet />
        </main>
        <BottomNav />
      </div>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
};

export default AppLayout;
