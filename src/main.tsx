import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { applyColorTheme, getStoredColorTheme } from "./hooks/useColorTheme";
import { installChunkLoadRecovery } from "./lib/chunk-recovery";

installChunkLoadRecovery();

// Apply stored color theme immediately to avoid flash
applyColorTheme(getStoredColorTheme());

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Trace could not find the app root.");
}

createRoot(rootEl).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Remove the pre-render skeleton injected into index.html as soon as React
// has painted its first frame. Two rAFs guarantees the new DOM is on screen
// before we tear the skeleton down — avoids a flash of empty background.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const skeleton = document.getElementById("boot-skeleton");
    if (skeleton) {
      skeleton.style.opacity = "0";
      setTimeout(() => skeleton.remove(), 200);
    }

    // Hide the Capacitor native splash screen, if present. Dynamic import so
    // the web build never pulls the plugin into its bundle.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      import("@capacitor/splash-screen")
        .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 }))
        .catch(() => {});
    }
  });
});
