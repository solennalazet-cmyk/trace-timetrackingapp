import { useState, useEffect, useCallback } from "react";
import { Play, Square, CheckCircle2 } from "lucide-react";

const LS_KEY = "trace_visited";
const AUTO_DISMISS_MS = 6000;

interface WelcomeBannerProps {
  onDismiss: () => void;
}

const WelcomeBanner = ({ onDismiss }: WelcomeBannerProps) => {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_KEY)) return;
    setVisible(true);
    const timer = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    setFading(true);
    localStorage.setItem(LS_KEY, "true");
    // Trigger pulse on Start button after the overlay fades
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("trace-onboard-pulse-start"));
    }, 200);
    setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 350);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6"
      style={{
        background: "hsl(var(--background) / 0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        opacity: fading ? 0 : 1,
        transition: "opacity 300ms ease",
      }}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl p-7 text-center animate-scale-in"
        style={{
          height: "75vh",
          maxHeight: 560,
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 20px 60px -10px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <h2
            className="font-mono font-bold text-timer-display"
            style={{ fontSize: 26, lineHeight: 1.15 }}
          >
            Tracking time with Trace is easy.
          </h2>

          <div className="flex flex-col gap-4 w-full">
            <Step
              icon={<Play className="w-5 h-5" />}
              title="Start"
              text="Tap Start or Clock In to begin."
            />
            <Step
              icon={<Square className="w-5 h-5" />}
              title="Stop"
              text="Stop or Clock Out when you're done."
            />
            <Step
              icon={<CheckCircle2 className="w-5 h-5" />}
              title="Save"
              text="Save your session in one tap."
            />
          </div>
        </div>

        <button
          onClick={dismiss}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-[28px] h-12"
          style={{ fontSize: 15 }}
        >
          Let's go →
        </button>
      </div>
    </div>
  );
};

const Step = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
  <div className="flex items-center gap-4 text-left">
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        background: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
      }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground leading-snug">{text}</p>
    </div>
  </div>
);

export default WelcomeBanner;
