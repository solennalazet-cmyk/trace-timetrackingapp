import { Link } from "react-router-dom";
import HeaderMenu from "./HeaderMenu";
import logo from "@/assets/logo.png";

const Header = () => {
  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] h-14 z-50 flex items-center justify-between px-4 transition-colors" id="app-header">
      <Link to="/" className="flex items-center gap-2" aria-label="Go to Start">
        <img src={logo} alt="Trace logo" className="w-7 h-7 rounded-lg" />
        <span className="font-mono text-xl font-bold text-timer-display">Trace</span>
      </Link>
      <HeaderMenu />
    </header>
  );
};

export default Header;
