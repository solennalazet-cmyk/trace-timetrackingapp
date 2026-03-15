import { Outlet } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";

const AppLayout = () => {
  return (
    <div className="gradient-bg min-h-screen">
      <div className="relative max-w-[420px] mx-auto min-h-screen">
        <Header />
        <main className="pt-14 pb-20 px-4 min-h-screen">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
};

export default AppLayout;
