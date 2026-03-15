import { Link } from "react-router-dom";
import HeaderMenu from "./HeaderMenu";

const Header = () => {
  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] h-14 z-50 flex items-center justify-between px-4">
      <Link to="/" className="flex items-center gap-2" aria-label="Go to Start">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 2L14 8L8 14L2 8L8 2Z" fill="hsl(217, 33%, 17%)" />
          </svg>
        </div>
        <span className="font-mono text-xl font-bold text-timer-display">Trace</span>
      </Link>
      <HeaderMenu />
    </header>
  );
};

export default Header;
