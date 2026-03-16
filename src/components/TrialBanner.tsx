import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays } from "date-fns";
import { redirectToCheckout } from "@/lib/stripe";
import { toast } from "sonner";

const TrialBanner = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!profile || profile.plan !== "trial" || !profile.trial_started_at) return null;

  const daysRemaining = Math.max(
    0,
    14 - differenceInDays(new Date(), new Date(profile.trial_started_at))
  );

  if (daysRemaining <= 0) return null;

  const isUrgent = daysRemaining <= 3;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      await redirectToCheckout();
    } catch (err: any) {
      toast.error(err.message || "Failed to start checkout.");
      setLoading(false);
    }
  };

  return (
    <div
      className={`px-4 py-2 text-center text-xs font-medium ${
        isUrgent
          ? "bg-accent text-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isUrgent ? (
        <span>
          Only {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left.{" "}
          <button className="underline font-semibold" onClick={handleUpgrade} disabled={loading}>
            {loading ? "Redirecting…" : "Upgrade now"}
          </button>{" "}
          to keep full access.
        </span>
      ) : (
        <span>
          {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left in your free trial ·{" "}
          <button className="underline" onClick={handleUpgrade} disabled={loading}>
            {loading ? "Redirecting…" : "See what's included in Pro →"}
          </button>
        </span>
      )}
    </div>
  );
};

export default TrialBanner;
