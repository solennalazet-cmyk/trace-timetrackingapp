import { useAuth } from "@/contexts/AuthContext";

interface AnonymousBannerProps {
  onSignIn: () => void;
}

const AnonymousBanner = ({ onSignIn }: AnonymousBannerProps) => {
  const { user } = useAuth();

  if (user) return null;

  return (
    <div className="w-full px-4 py-3 bg-destructive/10 border-b border-destructive/20">
      <button
        onClick={onSignIn}
        className="w-full text-center"
      >
        <p className="text-xs font-semibold text-destructive leading-snug">
          You haven't signed up yet — your data is at risk. It has nowhere to live and can't be accessed across devices. It may be erased at any automatic or manual browser clean-up.{" "}
          <span className="underline font-bold">Sign Up Now</span> to secure the data you tracked.
        </p>
      </button>
      <p className="mt-1.5 text-[10px] text-muted-foreground text-center leading-tight">
        Your data is stored locally on this device only — no one but you can access it.
      </p>
    </div>
  );
};

export default AnonymousBanner;
