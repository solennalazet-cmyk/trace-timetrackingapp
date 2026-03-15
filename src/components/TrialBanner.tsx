import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays } from "date-fns";

const TrialBanner = () => {
  const { profile } = useAuth();

  if (!profile || profile.plan !== "trial" || !profile.trial_started_at) return null;

  const daysRemaining = Math.max(
    0,
    14 - differenceInDays(new Date(), new Date(profile.trial_started_at))
  );

  if (daysRemaining <= 0) return null;

  const isUrgent = daysRemaining <= 3;

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
          <button className="underline font-semibold">Upgrade now</button> to keep full access.
        </span>
      ) : (
        <span>
          {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left in your free trial ·{" "}
          <button className="underline">See what's included in Pro →</button>
        </span>
      )}
    </div>
  );
};

export default TrialBanner;
