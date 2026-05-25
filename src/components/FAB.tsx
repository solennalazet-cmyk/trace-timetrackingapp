import { useState } from "react";
import { Plus, Clock, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ProBadge from "./ProBadge";
import PaywallModal from "./PaywallModal";

interface FABProps {
  onManualEntry: () => void;
  onLogCall: () => void;
}

const FAB = ({ onManualEntry, onLogCall }: FABProps) => {
  const [open, setOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { profile } = useAuth();

  const isFree = profile?.plan === "free";

  const handleLogCall = () => {
    setOpen(false);
    onLogCall();
  };

  return (
    <>
      <div className="fixed bottom-20 right-4 lg:absolute lg:bottom-6 lg:right-6 z-40 flex flex-col items-end gap-2" style={{ maxWidth: 420 }}>
        {open && (
          <div className="flex flex-col gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              onClick={() => { setOpen(false); onManualEntry(); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              }}
            >
              <Clock className="w-4 h-4 text-muted-foreground" />
              Manual Entry
            </button>
            <button
              onClick={handleLogCall}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              }}
            >
              <Phone className="w-4 h-4 text-muted-foreground" />
              Log Call
            </button>
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-transform"
          style={{
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
          aria-label="Add entry"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <PaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />

      {/* Click-away overlay */}
      {open && (
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
      )}
    </>
  );
};

export default FAB;
