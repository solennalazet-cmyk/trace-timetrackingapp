import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyColorTheme, getStoredColorTheme } from "./hooks/useColorTheme";

// Apply stored color theme immediately to avoid flash
applyColorTheme(getStoredColorTheme());

createRoot(document.getElementById("root")!).render(<App />);
