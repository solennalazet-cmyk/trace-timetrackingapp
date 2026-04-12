import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

const LS_KEY = "trace_visited";

interface WelcomeBannerProps {
  onDismiss: () => void;
}

const WelcomeBanner = ({ onDismiss }: WelcomeBannerProps) => {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_KEY)) return;
    setVisible(true);

    const timer = setTimeout(() => {
      dismiss();
    }, 8000);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = useCallback(() => {
    setFading(true);
    localStorage.setItem(LS_KEY, "true");
    setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 300);
  }, [onDismiss]);

  // Listen for nav clicks to dismiss
  useEffect(() => {
    if (!visible || fading) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is on nav, or outside the banner
      const banner = document.getElementById("welcome-banner");
      if (banner && !banner.contains(target)) {
        dismiss();
      }
    };
    // Use capture to catch nav clicks early
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [visible, fading, dismiss]);

  if (!visible) return null;

  return (
    <div
      id="welcome-banner"
      className="w-full mt-4 text-center"
      style={{
        background: "hsl(var(--card) / 0.85)",
        border: "1px solid hsl(var(--border))",
        borderRadius: 16,
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        padding: "20px 24px",
        opacity: fading ? 0 : 1,
        transition: "opacity 300ms ease",
      }}
    >
      <p
        className="font-sans font-medium mb-4"
        style={{ fontSize: 16, color: "hsl(var(--timer-display))" }}
      >
        Track your time. Work smarter. Bill better.
      </p>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
        style={{ borderRadius: 28, height: 48, fontSize: 15 }}
      >
        Let's go →
      </Button>
    </div>
  );
};

export default WelcomeBanner;
